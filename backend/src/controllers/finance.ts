/**
 * Finance controllers — parse the request, call one service, hand the result to one presenter.
 * Route handlers under src/app/api/v1/finance delegate here.
 */
import { Types } from "mongoose";
import { ReconciliationCheckModel } from "@/models";
import type { BoardDocument } from "@/domain/types";
import { badRequest, notFound, ok, parseBody, query } from "@/lib/http";
import { ReportVersionModel } from "@/models";
import { presentBoard, presentOverview, presentSummary, presentTimeline } from "@/presenters/finance";
import { consolidateBoards, loadAllBoards, loadTimeline, loadUnitBoard, type ReadOptions } from "@/services/financeQuery";
import { approveVersion, patchLineItems, saveBoardDocument } from "@/services/financeWrite";
import { ensurePeriodByLabel, getUnit, listPeriods, listUnits, parsePeriodLabel } from "@/services/structure";
import { ensureDraft, getVersion, listVersions, reject, submit } from "@/services/workflow";
import { boardDocumentSchema, lineItemPatchSchema, rejectSchema, resolveSchema } from "./schemas";
import { presentPeriod, presentUnit, presentVersion } from "./registry";

/** `period` names one month; `from` / `to` bound a range (either may be missing). All labels look like "June 2026". */
export function readOptions(req: Request): ReadOptions {
  const q = query(req);
  const mode = (q.get("versionMode") ?? "LATEST_APPROVED").toUpperCase();
  if (mode !== "LATEST_APPROVED" && mode !== "DRAFT") throw badRequest("versionMode must be LATEST_APPROVED or DRAFT");
  const period = q.get("period"), from = q.get("from"), to = q.get("to");
  for (const l of [period, from, to]) if (l) parsePeriodLabel(l);
  if (period && (from || to)) throw badRequest("Give either period or a from/to range, not both");
  return { periodLabel: period, from, to, versionMode: mode };
}

/** Month by month for a range (or everything): the boards each month holds and their totals. */
export async function getTimeline(req: Request) {
  const { from, to } = readOptions(req);
  const unit = query(req).get("unit");
  return ok(presentTimeline(await loadTimeline({ from, to }, unit || undefined)));
}

export async function getSummary(req: Request) {
  const boards = await loadAllBoards(readOptions(req));
  return ok(presentSummary(consolidateBoards(boards), boards));
}

export async function getBoard(req: Request, unit: string) {
  return ok(presentBoard(await loadUnitBoard(unit, readOptions(req))));
}

export async function getOverview(req: Request, unit: string) {
  return ok(presentOverview(await loadUnitBoard(unit, readOptions(req))));
}

export async function getLineItems(req: Request, unit: string) {
  const b = presentBoard(await loadUnitBoard(unit, readOptions(req)));
  return ok({ meta: b.meta, details: b.details, reconciliation: b.reconciliation });
}

/** Save a whole board document to the draft; `?publish=true` approves it in the same call. */
export async function putBoard(req: Request, unit: string) {
  const body = (await parseBody(req, boardDocumentSchema)) as unknown as BoardDocument;
  const publish = query(req).get("publish") === "true";
  const { warnings, version } = await saveBoardDocument(unit, body, { publish });
  const board = await loadUnitBoard(unit, { periodLabel: body.meta.asAt, versionMode: publish ? "LATEST_APPROVED" : "DRAFT" });
  return ok({ ...presentBoard(board), warnings, saved: presentVersion(version) });
}

/** Upsert or delete individual line items on the draft. */
export async function patchLines(req: Request, unit: string) {
  const patch = await parseBody(req, lineItemPatchSchema);
  const current = presentBoard(await loadUnitBoard(unit, { periodLabel: patch.periodLabel, versionMode: "DRAFT" }));
  const { warnings, version } = await patchLineItems(unit, patch, current);
  const board = await loadUnitBoard(unit, { periodLabel: patch.periodLabel ?? current.meta.asAt, versionMode: "DRAFT" });
  return ok({ ...presentBoard(board), warnings, saved: presentVersion(version) });
}

export async function getVersions(_req: Request, unit: string) {
  const u = await getUnit(unit);
  const periods = new Map((await listPeriods()).map((p) => [String(p._id), p.label]));
  return ok((await listVersions(u)).map((v) => ({ ...presentVersion(v), period: periods.get(String(v.fiscalPeriodId)) ?? null })));
}

/** Open (or return) the draft for a period, copied from the latest approved version. */
export async function postVersion(req: Request, unit: string) {
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.period === "string" ? body.period : null;
  if (!label) throw badRequest("period (e.g. \"July 2026\") is required");
  const u = await getUnit(unit);
  const p = await ensurePeriodByLabel(label);
  const v = await ensureDraft(u, p);
  return ok({ ...presentVersion(v), period: p.label }, { status: 201 });
}

export async function postSubmit(_req: Request, unit: string, id: string) {
  await getUnit(unit);
  return ok(presentVersion(await submit(await getVersion(id))));
}
export async function postApprove(_req: Request, unit: string, id: string) {
  const u = await getUnit(unit);
  const v = await getVersion(id);
  const p = (await listPeriods()).find((x) => String(x._id) === String(v.fiscalPeriodId));
  if (!p) throw notFound("Period for version");
  return ok(presentVersion(await approveVersion(u, p, v)));
}
export async function postReject(req: Request, unit: string, id: string) {
  await getUnit(unit);
  const { reason } = await parseBody(req, rejectSchema);
  return ok(presentVersion(await reject(await getVersion(id), reason)));
}

/** Live reconciliation for the version being viewed, plus the checks stored at approval (with their resolution). */
export async function getReconciliations(req: Request, unit: string) {
  const b = await loadUnitBoard(unit, readOptions(req));
  const board = presentBoard(b);
  return ok({
    meta: board.meta,
    live: board.reconciliation,
    stored: b.extras.storedChecks.map((c) => ({ id: String(c._id), checkCode: c.checkCode, label: c.label, field: c.column, page1: c.expectedMinor / 100, lineItems: c.actualMinor / 100, difference: c.differenceMinor / 100, status: c.status, explanation: c.explanation })),
  });
}
export async function postResolve(req: Request, unit: string, id: string) {
  await getUnit(unit);
  if (!Types.ObjectId.isValid(id)) throw notFound("Reconciliation check");
  const { status, explanation } = await parseBody(req, resolveSchema);
  const r = await ReconciliationCheckModel.findByIdAndUpdate(id, { $set: { status, explanation, resolvedAt: new Date(), resolvedBy: "anonymous" } }, { new: true }).lean();
  if (!r) throw notFound("Reconciliation check");
  return ok({ id: String(r._id), status: r.status, explanation: r.explanation });
}

export async function getUnits() { return ok((await listUnits()).map(presentUnit)); }
/** Every fiscal period, with the units that have an approved board or an open draft in it, so a picker can show what each month holds. */
export async function getPeriods() {
  const [periods, units, versions] = await Promise.all([
    listPeriods(), listUnits(),
    ReportVersionModel.find({ status: { $in: ["APPROVED", "DRAFT", "IN_REVIEW"] } }, { operatingUnitId: 1, fiscalPeriodId: 1, status: 1, isPlaceholder: 1 }).lean(),
  ]);
  const code = new Map(units.map((u) => [String(u._id), u.code]));
  return ok(periods.map((p) => {
    const here = versions.filter((v) => String(v.fiscalPeriodId) === String(p._id) && code.has(String(v.operatingUnitId)));
    const approved = [...new Set(here.filter((v) => v.status === "APPROVED").map((v) => code.get(String(v.operatingUnitId))!))];
    const drafts = [...new Set(here.filter((v) => v.status !== "APPROVED").map((v) => code.get(String(v.operatingUnitId))!))];
    return { ...presentPeriod(p), approved, drafts, placeholder: here.some((v) => v.status === "APPROVED" && v.isPlaceholder) };
  }));
}
