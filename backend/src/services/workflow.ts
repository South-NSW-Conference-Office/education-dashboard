/**
 * WorkflowService — report versions: DRAFT → IN_REVIEW → APPROVED → SUPERSEDED.
 * Dashboards read the latest APPROVED version; editors work on the DRAFT.
 * Approved and superseded versions are immutable (guarded here, since MongoDB has no triggers).
 */
import { Types } from "mongoose";
import {
  AuditEventModel, CommentaryNoteModel, FinancialFactModel, FinancialObligationModel, ReceivablesSnapshotModel,
  ReconciliationCheckModel, ReportedTotalModel, ReportingSnapshotModel, ReportVersionModel,
} from "@/models";
import type { ReconciliationItem, VersionStatus } from "@/domain/types";
import { conflict, notFound } from "@/lib/http";
import type { Id, PeriodDoc, UnitDoc } from "./structure";

export interface VersionDoc {
  _id: Id; reportingSnapshotId: Id; operatingUnitId: Id; fiscalPeriodId: Id; versionNo: number; status: VersionStatus;
  supersedesVersionId: Id | null; importBatchId: Id | null; isPlaceholder: boolean; notes: string | null;
  createdAt: Date; updatedAt: Date; approvedAt: Date | null;
}

export async function getVersion(id: string): Promise<VersionDoc> {
  if (!Types.ObjectId.isValid(id)) throw notFound(`Version "${id}"`);
  const v = (await ReportVersionModel.findById(id).lean()) as unknown as VersionDoc | null;
  if (!v) throw notFound(`Version "${id}"`);
  return v;
}

export function assertEditable(v: VersionDoc): void {
  if (v.status !== "DRAFT" && v.status !== "IN_REVIEW") throw conflict(`Version ${v.versionNo} is ${v.status} and cannot be changed. Open a new draft.`);
}

export async function audit(entity: string, entityId: Id | string, action: string, extra: Partial<{ before: unknown; after: unknown; reason: string; actor: string }> = {}) {
  await AuditEventModel.create({ entity, entityId: String(entityId), action, ...extra });
}

async function snapshotFor(unit: UnitDoc, period: PeriodDoc): Promise<Id> {
  const s = await ReportingSnapshotModel.findOneAndUpdate(
    { operatingUnitId: unit._id, fiscalPeriodId: period._id, snapshotType: "MONTHLY_OPERATING_REPORT" },
    { $setOnInsert: { operatingUnitId: unit._id, fiscalPeriodId: period._id, snapshotType: "MONTHLY_OPERATING_REPORT", asOfDate: period.endsOn } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return s!._id as Id;
}

export async function latestApproved(unit: UnitDoc, period?: PeriodDoc): Promise<VersionDoc | null> {
  const q: Record<string, unknown> = { operatingUnitId: unit._id, status: "APPROVED" };
  if (period) q.fiscalPeriodId = period._id;
  const vs = (await ReportVersionModel.find(q).lean()) as unknown as VersionDoc[];
  return pickLatest(vs);
}
export async function openDraft(unit: UnitDoc, period?: PeriodDoc): Promise<VersionDoc | null> {
  const q: Record<string, unknown> = { operatingUnitId: unit._id, status: { $in: ["DRAFT", "IN_REVIEW"] } };
  if (period) q.fiscalPeriodId = period._id;
  const vs = (await ReportVersionModel.find(q).lean()) as unknown as VersionDoc[];
  return pickLatest(vs);
}
/** Newest period first, then highest version number. Period order comes from the snapshot's asOfDate. */
async function pickLatest(vs: VersionDoc[]): Promise<VersionDoc | null> {
  if (!vs.length) return null;
  const snaps = await ReportingSnapshotModel.find({ _id: { $in: vs.map((v) => v.reportingSnapshotId) } }).lean();
  const asOf = new Map(snaps.map((s) => [String(s._id), s.asOfDate.getTime()]));
  return vs.sort((a, b) => (asOf.get(String(b.reportingSnapshotId))! - asOf.get(String(a.reportingSnapshotId))!) || b.versionNo - a.versionNo)[0];
}

/**
 * The draft to edit for a unit and period. Reuses an open draft; otherwise copies the
 * latest approved version (facts, page-1 totals, debtors, obligations, notes) into a new one.
 */
export async function ensureDraft(unit: UnitDoc, period: PeriodDoc, opts: { importBatchId?: Id; isPlaceholder?: boolean; copyFrom?: "approved" | "none" } = {}): Promise<VersionDoc> {
  const existing = await openDraft(unit, period);
  if (existing) return existing;
  const snapshotId = await snapshotFor(unit, period);
  const last = await ReportVersionModel.findOne({ reportingSnapshotId: snapshotId }).sort({ versionNo: -1 }).lean();
  const approved = opts.copyFrom === "none" ? null : await latestApproved(unit, period);
  const created = await ReportVersionModel.create({
    reportingSnapshotId: snapshotId, operatingUnitId: unit._id, fiscalPeriodId: period._id,
    versionNo: (last?.versionNo ?? 0) + 1, status: "DRAFT",
    supersedesVersionId: approved?._id ?? null, importBatchId: opts.importBatchId ?? null,
    isPlaceholder: opts.isPlaceholder ?? approved?.isPlaceholder ?? false,
  });
  const v = created.toObject() as unknown as VersionDoc;
  if (approved) await copyVersionContents(approved._id, v._id);
  await audit("report_version", v._id, "CREATE_DRAFT", { after: { versionNo: v.versionNo, from: approved?._id ?? null } });
  return v;
}

async function copyVersionContents(from: Id, to: Id): Promise<void> {
  const strip = <T extends { _id?: unknown; createdAt?: unknown; updatedAt?: unknown; __v?: unknown }>(d: T) => {
    const { _id: _a, createdAt: _b, updatedAt: _c, __v: _d, ...rest } = d; return { ...rest, reportVersionId: to };
  };
  const [facts, totals, recv, obl, notes] = await Promise.all([
    FinancialFactModel.find({ reportVersionId: from }).lean(), ReportedTotalModel.find({ reportVersionId: from }).lean(),
    ReceivablesSnapshotModel.find({ reportVersionId: from }).lean(), FinancialObligationModel.find({ reportVersionId: from }).lean(),
    CommentaryNoteModel.find({ reportVersionId: from }).lean(),
  ]);
  if (facts.length) await FinancialFactModel.insertMany(facts.map(strip));
  if (totals.length) await ReportedTotalModel.insertMany(totals.map(strip));
  if (recv.length) await ReceivablesSnapshotModel.insertMany(recv.map(strip));
  if (obl.length) await FinancialObligationModel.insertMany(obl.map(strip));
  if (notes.length) await CommentaryNoteModel.insertMany(notes.map(strip));
}

export async function submit(v: VersionDoc): Promise<VersionDoc> {
  if (v.status !== "DRAFT") throw conflict(`Version ${v.versionNo} is ${v.status}; only a DRAFT can be submitted.`);
  await ReportVersionModel.updateOne({ _id: v._id }, { $set: { status: "IN_REVIEW", submittedAt: new Date() } });
  await audit("report_version", v._id, "SUBMIT");
  return getVersion(String(v._id));
}

/** Approve: store the reconciliation checks, mark the previous approved version superseded. */
export async function approve(v: VersionDoc, checks: ReconciliationItem[], actor = "anonymous"): Promise<VersionDoc> {
  if (v.status !== "DRAFT" && v.status !== "IN_REVIEW") throw conflict(`Version ${v.versionNo} is ${v.status}; nothing to approve.`);
  await ReconciliationCheckModel.deleteMany({ reportVersionId: v._id });
  if (checks.length) await ReconciliationCheckModel.insertMany(checks.map((c) => ({
    reportVersionId: v._id, checkCode: c.checkCode, reportingGroupCode: c.groupCode, label: c.label, column: c.column,
    expectedMinor: c.expectedMinor, actualMinor: c.actualMinor, differenceMinor: c.differenceMinor, status: c.status,
  })));
  await ReportVersionModel.updateMany(
    { reportingSnapshotId: v.reportingSnapshotId, status: "APPROVED", _id: { $ne: v._id } },
    { $set: { status: "SUPERSEDED" } },
  );
  await ReportVersionModel.updateOne({ _id: v._id }, { $set: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor } });
  await audit("report_version", v._id, "APPROVE", { actor, after: { checks: checks.length } });
  return getVersion(String(v._id));
}

export async function reject(v: VersionDoc, reason?: string): Promise<VersionDoc> {
  assertEditable(v);
  await ReportVersionModel.updateOne({ _id: v._id }, { $set: { status: "REJECTED", notes: reason ?? null } });
  await audit("report_version", v._id, "REJECT", { reason });
  return getVersion(String(v._id));
}

export async function listVersions(unit: UnitDoc): Promise<VersionDoc[]> {
  return (await ReportVersionModel.find({ operatingUnitId: unit._id }).sort({ createdAt: -1 }).lean()) as unknown as VersionDoc[];
}
