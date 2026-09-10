/**
 * Models — imports, report versions, facts and the checks around them.
 * A fact is one amount at (version, unit, period, account, scenario, basis).
 */
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PERIOD_BASES, SCENARIOS, SOURCE_SYSTEMS, VERSION_STATUSES } from "@/domain/types";

const model = <T>(name: string, schema: Schema<T>, collection: string): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema, collection);

/* ---------- import batches (manual upload today, MYOB / Synergetic / Hubworks later) ---------- */
const importBatchSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  sourceSystem: { type: String, enum: SOURCE_SYSTEMS, required: true },
  fileName: { type: String, default: null },
  checksum: { type: String, default: null },
  status: { type: String, enum: ["RECEIVED", "VALIDATED", "PUBLISHED", "FAILED", "REJECTED"], default: "RECEIVED" },
  payload: { type: Schema.Types.Mixed, default: null },       // exactly what arrived (a board document for now)
  validation: { type: Schema.Types.Mixed, default: null },    // errors / warnings / mapping gaps
  unitCode: { type: String, default: null },
  periodLabel: { type: String, default: null },
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", default: null },
  importedBy: { type: String, default: null },
}, { timestamps: true });
export type ImportBatch = InferSchemaType<typeof importBatchSchema>;
export const ImportBatchModel = model("ImportBatch", importBatchSchema, "import_batches");

/* ---------- one snapshot = one unit's monthly report cut-off ---------- */
const reportingSnapshotSchema = new Schema({
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  fiscalPeriodId: { type: Schema.Types.ObjectId, ref: "FiscalPeriod", required: true },
  snapshotType: { type: String, enum: ["MONTHLY_OPERATING_REPORT"], default: "MONTHLY_OPERATING_REPORT" },
  asOfDate: { type: Date, required: true },
}, { timestamps: true });
reportingSnapshotSchema.index({ operatingUnitId: 1, fiscalPeriodId: 1, snapshotType: 1 }, { unique: true });
export type ReportingSnapshot = InferSchemaType<typeof reportingSnapshotSchema>;
export const ReportingSnapshotModel = model("ReportingSnapshot", reportingSnapshotSchema, "reporting_snapshots");

/* ---------- versions of a snapshot: dashboards read LATEST APPROVED, editors work on the DRAFT ---------- */
const reportVersionSchema = new Schema({
  reportingSnapshotId: { type: Schema.Types.ObjectId, ref: "ReportingSnapshot", required: true },
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true, index: true },
  fiscalPeriodId: { type: Schema.Types.ObjectId, ref: "FiscalPeriod", required: true },
  versionNo: { type: Number, required: true },
  status: { type: String, enum: VERSION_STATUSES, default: "DRAFT", index: true },
  supersedesVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", default: null },
  importBatchId: { type: Schema.Types.ObjectId, ref: "ImportBatch", default: null },
  isPlaceholder: { type: Boolean, default: false },           // the ELC board's draft/sample figures
  notes: { type: String, default: null },
  submittedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: String, default: null },
}, { timestamps: true });
reportVersionSchema.index({ reportingSnapshotId: 1, versionNo: 1 }, { unique: true });
export type ReportVersion = InferSchemaType<typeof reportVersionSchema>;
export const ReportVersionModel = model("ReportVersion", reportVersionSchema, "report_versions");

/* ---------- financial facts (the raw data) ---------- */
const financialFactSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  fiscalPeriodId: { type: Schema.Types.ObjectId, ref: "FiscalPeriod", required: true },
  accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  accountCode: { type: String, required: true },              // denormalised for fast roll-ups
  scenario: { type: String, enum: SCENARIOS, required: true },
  periodBasis: { type: String, enum: PERIOD_BASES, required: true },
  amountMinor: { type: Number, required: true },              // integer cents, natural sign
  currencyCode: { type: String, default: "AUD" },
  sourceRowCode: { type: String, default: null },
  sourceRowLabel: { type: String, default: null },
  /** which group the source report listed this line under — keeps the report's own structure */
  sourceGroupCode: { type: String, default: null },
}, { timestamps: true });
financialFactSchema.index({ reportVersionId: 1, accountId: 1, scenario: 1, periodBasis: 1 }, { unique: true });
export type FinancialFact = InferSchemaType<typeof financialFactSchema>;
export const FinancialFactModel = model("FinancialFact", financialFactSchema, "financial_facts");

/* ---------- totals printed on page 1 of the source report ---------- */
const reportedTotalSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  metricCode: { type: String, enum: ["GROUP_TOTAL", "EBIDA_ADDBACK", "SALARY_SUBLINE"], required: true },
  reportingGroupCode: { type: String, default: null },
  scenario: { type: String, enum: SCENARIOS, required: true },
  periodBasis: { type: String, enum: PERIOD_BASES, required: true },
  amountMinor: { type: Number, required: true },
  sourcePage: { type: String, default: "page 1" },
});
reportedTotalSchema.index({ reportVersionId: 1, metricCode: 1, reportingGroupCode: 1, scenario: 1, periodBasis: 1 }, { unique: true });
export type ReportedTotal = InferSchemaType<typeof reportedTotalSchema>;
export const ReportedTotalModel = model("ReportedTotal", reportedTotalSchema, "reported_totals");

/* ---------- reconciliation checks stored when a version is approved ---------- */
const reconciliationCheckSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  checkCode: { type: String, required: true },
  reportingGroupCode: { type: String, default: null },
  label: { type: String, required: true },
  column: { type: String, required: true },
  expectedMinor: { type: Number, required: true },            // declared (page 1)
  actualMinor: { type: Number, required: true },              // calculated from lines
  differenceMinor: { type: Number, required: true },
  toleranceMinor: { type: Number, default: 1000 },
  status: { type: String, enum: ["PASS", "WARNING", "FAILED", "RESOLVED", "WAIVED"], required: true },
  explanation: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null },
}, { timestamps: true });
export type ReconciliationCheck = InferSchemaType<typeof reconciliationCheckSchema>;
export const ReconciliationCheckModel = model("ReconciliationCheck", reconciliationCheckSchema, "reconciliation_checks");

/* ---------- audit ---------- */
const auditEventSchema = new Schema({
  entity: { type: String, required: true },
  entityId: { type: String, required: true },
  action: { type: String, required: true },
  actor: { type: String, default: "anonymous" },              // users arrive later
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  reason: { type: String, default: null },
}, { timestamps: { createdAt: "occurredAt", updatedAt: false } });
auditEventSchema.index({ entity: 1, entityId: 1, occurredAt: -1 });
export type AuditEvent = InferSchemaType<typeof auditEventSchema>;
export const AuditEventModel = model("AuditEvent", auditEventSchema, "audit_events");
