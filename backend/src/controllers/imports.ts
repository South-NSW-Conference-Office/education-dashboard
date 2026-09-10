/**
 * Import pipeline — upload → validate (preview) → publish as a DRAFT (or approved) version.
 * Today the payload is a board document; the MYOB / Synergetic / Hubworks jobs will
 * create batches through the same path.
 */
import { Types } from "mongoose";
import { ImportBatchModel } from "@/models";
import type { BoardDocument } from "@/domain/types";
import { conflict, notFound, ok, parseBody, query } from "@/lib/http";
import { extractBoard } from "@/services/boardDocument";
import { saveBoardDocument } from "@/services/financeWrite";
import { getOrg, getUnit, parsePeriodLabel } from "@/services/structure";
import { importCreateSchema } from "./schemas";
import { presentVersion } from "./registry";

const present = (b: { _id: unknown; sourceSystem: string; fileName: string | null; status: string; unitCode: string | null; periodLabel: string | null; validation: unknown; reportVersionId: unknown; createdAt?: Date }) => ({
  id: String(b._id), sourceSystem: b.sourceSystem, fileName: b.fileName, status: b.status, unit: b.unitCode, period: b.periodLabel,
  validation: b.validation, reportVersion: b.reportVersionId ? String(b.reportVersionId) : null, createdAt: b.createdAt?.toISOString() ?? null,
});

/** Receive a board and validate it without touching any version. */
export async function postImport(req: Request) {
  const body = await parseBody(req, importCreateSchema);
  const org = await getOrg();
  await getUnit(body.unit);
  parsePeriodLabel(body.board.meta.asAt);
  const ex = extractBoard(body.board as unknown as BoardDocument);
  const errors: string[] = [];
  if (!ex.lines.length) errors.push("No line items found in details.income / details.expenditure");
  const validation = {
    lines: ex.lines.length, groups: ex.groups.map((g) => g.name), reportedTotals: ex.reportedTotals.length,
    warnings: [...ex.warnings, ...ex.duplicates], errors,
  };
  const batch = await ImportBatchModel.create({
    organisationId: org._id, sourceSystem: body.sourceSystem, fileName: body.fileName ?? null, status: errors.length ? "FAILED" : "VALIDATED",
    payload: body.board, validation, unitCode: body.unit, periodLabel: body.board.meta.asAt,
  });
  return ok(present(batch.toObject() as never), { status: 201 });
}

export async function listImports() {
  return ok((await ImportBatchModel.find().sort({ createdAt: -1 }).limit(50).lean()).map((b) => present(b as never)));
}

export async function getImport(_req: Request, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Import");
  const b = await ImportBatchModel.findById(id).lean();
  if (!b) throw notFound("Import");
  return ok(present(b as never));
}

/** Turn a validated batch into a draft version (or an approved one with `?approve=true`). */
export async function publishImport(req: Request, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Import");
  const b = await ImportBatchModel.findById(id).lean();
  if (!b) throw notFound("Import");
  if (b.status !== "VALIDATED") throw conflict(`Import is ${b.status}; only a VALIDATED import can be published`);
  const approve = query(req).get("approve") === "true";
  const { version, warnings } = await saveBoardDocument(b.unitCode!, b.payload as BoardDocument, { publish: approve, importBatchId: b._id as never, actor: `import:${b.sourceSystem}`, reportedTotals: "replace" });
  await ImportBatchModel.updateOne({ _id: b._id }, { $set: { status: "PUBLISHED", reportVersionId: version._id, validation: { ...(b.validation as object), publishWarnings: warnings } } });
  return ok({ import: present({ ...(b as unknown as Record<string, unknown>), status: "PUBLISHED", reportVersionId: version._id } as never), version: presentVersion(version) });
}
