/**
 * Models — organisation, calendar and reporting structure.
 * These change rarely and are shared by every unit.
 */
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SECTIONS, UNIT_TYPES } from "@/domain/types";

const model = <T>(name: string, schema: Schema<T>, collection: string): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema, collection);

/* ---------- organisation ---------- */
const organisationSchema = new Schema({
  code: { type: String, required: true, unique: true },       // 'SNSW'
  name: { type: String, required: true },
  currencyCode: { type: String, default: "AUD" },
  timezone: { type: String, default: "Australia/Sydney" },
}, { timestamps: true });
export type Organisation = InferSchemaType<typeof organisationSchema>;
export const OrganisationModel = model("Organisation", organisationSchema, "organisations");

/* ---------- operating units (schools, ELC, conference) ---------- */
const operatingUnitSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true, index: true },
  parentUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", default: null },
  code: { type: String, required: true },                     // 'bcc', 'ncs', 'ccs', 'ccs-elc'
  name: { type: String, required: true },
  shortName: { type: String, required: true },
  unitType: { type: String, enum: UNIT_TYPES, required: true },
  legalEntity: { type: String, default: null },
  location: { type: String, default: "" },
  colourHex: { type: String, default: null },
  databoardKey: { type: String, default: null },              // 'bcc' | 'nar' | 'elc' | 'ccs' in the original databoard file
  reportingEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });
operatingUnitSchema.index({ organisationId: 1, code: 1 }, { unique: true });
export type OperatingUnit = InferSchemaType<typeof operatingUnitSchema>;
export const OperatingUnitModel = model("OperatingUnit", operatingUnitSchema, "operating_units");

/* ---------- calendar ---------- */
const fiscalYearSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  code: { type: String, required: true },                     // 'FY2026' (calendar year for these schools)
  startsOn: { type: Date, required: true },
  endsOn: { type: Date, required: true },
  status: { type: String, enum: ["OPEN", "SOFT_CLOSED", "HARD_CLOSED"], default: "OPEN" },
});
fiscalYearSchema.index({ organisationId: 1, code: 1 }, { unique: true });
export type FiscalYear = InferSchemaType<typeof fiscalYearSchema>;
export const FiscalYearModel = model("FiscalYear", fiscalYearSchema, "fiscal_years");

const fiscalPeriodSchema = new Schema({
  fiscalYearId: { type: Schema.Types.ObjectId, ref: "FiscalYear", required: true },
  periodNo: { type: Number, required: true },                 // 1..12
  label: { type: String, required: true },                    // 'June 2026' — what the boards call "as at"
  startsOn: { type: Date, required: true },
  endsOn: { type: Date, required: true },
  status: { type: String, enum: ["OPEN", "SOFT_CLOSED", "HARD_CLOSED"], default: "OPEN" },
});
fiscalPeriodSchema.index({ fiscalYearId: 1, periodNo: 1 }, { unique: true });
fiscalPeriodSchema.index({ label: 1 });
export type FiscalPeriod = InferSchemaType<typeof fiscalPeriodSchema>;
export const FiscalPeriodModel = model("FiscalPeriod", fiscalPeriodSchema, "fiscal_periods");

/* ---------- chart of accounts ---------- */
const accountSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  code: { type: String, required: true },                     // '1030'; synthetic codes start with 'X-' for lines the report gave no code
  name: { type: String, required: true },
  accountClass: { type: String, enum: ["REVENUE", "EXPENSE", "CAPITAL_INCOME", "CAPITAL_EXPENDITURE", "MEMO"], required: true },
  normalBalance: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
  isIntercompany: { type: Boolean, default: false },          // e.g. internal management fees
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
accountSchema.index({ organisationId: 1, code: 1 }, { unique: true });
export type Account = InferSchemaType<typeof accountSchema>;
export const AccountModel = model("Account", accountSchema, "accounts");

/* ---------- reporting groups (the Overview categories) ---------- */
const reportingGroupSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  code: { type: String, required: true },                     // 'STUDENT_TUITION'
  name: { type: String, required: true },                     // 'Student tuition'
  aliases: { type: [String], default: [] },                   // names the source reports use for the same group
  section: { type: String, enum: SECTIONS, required: true },
  displayOrder: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
});
reportingGroupSchema.index({ organisationId: 1, code: 1 }, { unique: true });
export type ReportingGroup = InferSchemaType<typeof reportingGroupSchema>;
export const ReportingGroupModel = model("ReportingGroup", reportingGroupSchema, "reporting_groups");

/* ---------- account → group, effective-dated ---------- */
const accountGroupMappingSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  reportingGroupId: { type: Schema.Types.ObjectId, ref: "ReportingGroup", required: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null },
});
accountGroupMappingSchema.index({ accountId: 1, validFrom: 1 }, { unique: true });
export type AccountGroupMapping = InferSchemaType<typeof accountGroupMappingSchema>;
export const AccountGroupMappingModel = model("AccountGroupMapping", accountGroupMappingSchema, "account_group_mappings");

/* ---------- metric definitions (formulas as data) ---------- */
const metricDefinitionSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  code: { type: String, required: true },                     // EBIDA_ADDBACK | SALARY_SUBLINE | FINANCE_LIGHT
  name: { type: String, required: true },
  formulaType: { type: String, required: true },              // ACCOUNT_SUM | THRESHOLD | SCHEDULE
  definition: { type: Schema.Types.Mixed, required: true },   // e.g. { accountCodes: ['2640', ...] }
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null },
}, { timestamps: true });
metricDefinitionSchema.index({ organisationId: 1, code: 1, effectiveFrom: 1 }, { unique: true });
export type MetricDefinition = InferSchemaType<typeof metricDefinitionSchema>;
export const MetricDefinitionModel = model("MetricDefinition", metricDefinitionSchema, "metric_definitions");
