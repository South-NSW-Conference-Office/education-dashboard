/**
 * Models — the raw data that sits beside the facts on a finance board:
 * family debtors, loans and leases, and narrative notes.
 * All are keyed to a report version so they travel with it through draft → approved.
 */
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SOURCE_SYSTEMS } from "@/domain/types";

const model = <T>(name: string, schema: Schema<T>, collection: string): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema, collection);

const receivablesSnapshotSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  receivableType: { type: String, enum: ["FAMILY_DEBTORS"], default: "FAMILY_DEBTORS" },
  currentMinor: { type: Number, default: 0 },                 // this year, at the report date
  priorYearMinor: { type: Number, default: 0 },               // same point last year
  sourceSystem: { type: String, enum: SOURCE_SYSTEMS, default: "MANUAL" },
}, { timestamps: true });
receivablesSnapshotSchema.index({ reportVersionId: 1, receivableType: 1 }, { unique: true });
export type ReceivablesSnapshot = InferSchemaType<typeof receivablesSnapshotSchema>;
export const ReceivablesSnapshotModel = model("ReceivablesSnapshot", receivablesSnapshotSchema, "receivables_snapshots");

const financialObligationSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  obligationType: { type: String, enum: ["LOAN", "LEASE"], required: true },
  name: { type: String, default: "" },
  paymentMinor: { type: Number, default: 0 },
  paymentFrequency: { type: String, default: "" },            // 'Monthly', 'YTD amortisation' — as the boards label it
  endsOn: { type: String, default: "" },                      // free text until schedules arrive
  notes: { type: String, default: "" },
  displayOrder: { type: Number, default: 0 },
  schedule: { type: [new Schema({ dueDate: Date, figureKind: String, amountMinor: Number }, { _id: false })], default: [] },
}, { timestamps: true });
export type FinancialObligation = InferSchemaType<typeof financialObligationSchema>;
export const FinancialObligationModel = model("FinancialObligation", financialObligationSchema, "financial_obligations");

const commentaryNoteSchema = new Schema({
  reportVersionId: { type: Schema.Types.ObjectId, ref: "ReportVersion", required: true, index: true },
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  noteType: { type: String, enum: ["CURRENT_IMPACT", "UPCOMING_IMPACT", "STRATEGIC_NOTE", "DATA_QUALITY_ISSUE", "ACCOUNTANT_QUERY"], required: true },
  body: { type: String, default: "" },
  severity: { type: String, enum: ["INFO", "WATCH", "WARNING", "CRITICAL"], default: "INFO" },
  status: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN" },
}, { timestamps: true });
commentaryNoteSchema.index({ reportVersionId: 1, noteType: 1 });
export type CommentaryNote = InferSchemaType<typeof commentaryNoteSchema>;
export const CommentaryNoteModel = model("CommentaryNote", commentaryNoteSchema, "commentary_notes");
