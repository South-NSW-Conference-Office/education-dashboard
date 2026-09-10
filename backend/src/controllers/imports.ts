/**
 * Import pipeline — upload → validate (preview) → publish as a DRAFT (or approved) version.
 * Two ways in: a board document as JSON (what the MYOB / Synergetic / Hubworks jobs will send) and
 * the monthly operating-report PDF, which is parsed into the same board document.
 */
import { Types } from "mongoose";
import { ImportBatchModel } from "@/models";
import type { BoardDocument } from "@/domain/types";
import { badRequest, conflict, notFound, ok, parseBody, query } from "@/lib/http";
import { extractBoard } from "@/services/boardDocument";
import { saveBoardDocument } from "@/services/financeWrite";
import { preparePdfImport } from "@/services/pdfImport";
import { getOrg, getUnit, parsePeriodLabel } from "@/services/structure";
import { importCreateSchema } from "./schemas";
import { presentVersion } from "./registry";

type BatchDoc = { _id: unknown; sourceSystem: string; fileName: string | null; status: string; unitCode: string | null; periodLabel: string | null; validation: unknown; reportVersionId: unknown; createdAt?: Date };
const present = (b: BatchDoc) => ({
  id: String(b._id), sourceSystem: b.sourceSystem, fileName: b.fileName, status: b.status, unit: b.unitCode, period: b.periodLabel,
  validation: b.validation, reportVersion: b.reportVersionId ? String(b.reportVersionId) : null, createdAt: b.createdAt?.toISOString() ?? null,
});

/** What the board would give the fact model, without writing anything. */
function validate(board: BoardDocument, extra: { warnings?: string[]; errors?: string[] } = {}) {
  const ex = extractBoard(board);
  const errors = [...(extra.errors ?? [])];
  if (!ex.lines.length) errors.push("No line items found in details.income / details.expenditure");
  return {
    lines: ex.lines.length, groups: ex.groups.map((g) => g.name), reportedTotals: ex.reportedTotals.length,
    warnings: [...(extra.warnings ?? []), ...ex.warnings, ...ex.duplicates], errors,
  };
}

/** Receive a board and validate it without touching any version. */
export async function postImport(req: Request) {
  const body = await parseBody(req, importCreateSchema);
  const org = await getOrg();
  await getUnit(body.unit);
  parsePeriodLabel(body.board.meta.asAt);
  const validation = validate(body.board as unknown as BoardDocument);
  const batch = await ImportBatchModel.create({
    organisationId: org._id, sourceSystem: body.sourceSystem, fileName: body.fileName ?? null, status: validation.errors.length ? "FAILED" : "VALIDATED",
    payload: body.board, validation, unitCode: body.unit, periodLabel: body.board.meta.asAt,
  });
  return ok(present(batch.toObject() as never), { status: 201 });
}

/**
 * Receive the monthly operating report as a PDF (multipart, field `file`; optional `unit` = the board it
 * was uploaded from). Parses it, validates it and stores it as a batch for preview; `?publish=true`
 * (and `&approve=true`) goes straight on to a version.
 */
export async function postPdfImport(req: Request) {
  const form = await req.formData().catch(() => { throw badRequest("Send the PDF as multipart form data with a 'file' field"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Attach the PDF as the 'file' field");
  if (file.size > 25 * 1024 * 1024) throw badRequest("The PDF is larger than 25 MB");
  const unitCode = (form.get("unit") as string | null) || query(req).get("unit");
  const bytes = new Uint8Array(await file.arrayBuffer());

  const org = await getOrg();
  const r = await preparePdfImport(bytes, { unitCode, fileName: file.name });
  const validation = { ...validate(r.board, { warnings: r.warnings, errors: r.errors }), notes: r.notes, detected: r.detected };
  const batch = await ImportBatchModel.create({
    organisationId: org._id, sourceSystem: "PDF_REPORT", fileName: file.name, checksum: r.checksum, status: validation.errors.length ? "FAILED" : "VALIDATED",
    payload: r.board, validation, unitCode: r.unit.code, periodLabel: r.board.meta.asAt || null,
  });
  const q = query(req);
  const response = { import: present(batch.toObject() as never), board: r.board, detected: r.detected, warnings: validation.warnings, notes: r.notes, errors: validation.errors, lines: validation.lines, version: null as ReturnType<typeof presentVersion> | null };
  if (q.get("publish") === "true" && !validation.errors.length) {
    const published = await publishBatch(batch.toObject() as never, q.get("approve") === "true");
    response.import = published.import; response.version = published.version;
  }
  return ok(response, { status: 201 });
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

async function publishBatch(b: BatchDoc & { payload: unknown; validation: unknown }, approve: boolean) {
  if (b.status !== "VALIDATED") throw conflict(`Import is ${b.status}; only a VALIDATED import can be published`);
  const { version, warnings } = await saveBoardDocument(b.unitCode!, b.payload as BoardDocument, { publish: approve, importBatchId: b._id as never, actor: `import:${b.sourceSystem}`, reportedTotals: "replace" });
  await ImportBatchModel.updateOne({ _id: b._id }, { $set: { status: "PUBLISHED", reportVersionId: version._id, validation: { ...(b.validation as object), publishWarnings: warnings } } });
  return { import: present({ ...b, status: "PUBLISHED", reportVersionId: version._id }), version: presentVersion(version), warnings };
}

/** Turn a validated batch into a draft version (or an approved one with `?approve=true`). */
export async function publishImport(req: Request, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Import");
  const b = await ImportBatchModel.findById(id).lean();
  if (!b) throw notFound("Import");
  return ok(await publishBatch(b as never, query(req).get("approve") === "true"));
}
