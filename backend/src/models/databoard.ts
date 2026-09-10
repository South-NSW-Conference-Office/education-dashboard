/**
 * Models — the weekly education databoard.
 * A week's board is one aggregate document holding only the judgement fields.
 * Finance and Overall lights, the operating result and each school's budget and
 * variance are never stored; the presenter derives them from the finance side.
 */
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SOURCE_SYSTEMS } from "@/domain/types";

const model = <T>(name: string, schema: Schema<T>, collection: string): Model<T> =>
  (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema, collection);

const rating = { type: String, enum: ["GREEN", "AMBER", "RED"] };

const healthRatingSchema = new Schema({
  unitCode: { type: String, required: true },
  schoolLabel: { type: String, default: "" },                 // display override; defaults to the unit name
  subLabel: { type: String, default: "" },
  enrolments: rating, staffing: rating, buildings: rating, whs: rating,
  notes: { type: Map, of: String, default: {} },              // per measure, including 'finance' and 'overall' text
}, { _id: false });

const cashItemSchema = new Schema({
  kind: { type: String, enum: ["CASH_ON_HAND", "OPERATING_RESULT", "LOAN_BALANCES", "RESERVES", "OTHER"], required: true },
  label: { type: String, required: true },
  amountMinor: { type: Number, default: null },               // null for OPERATING_RESULT (derived)
  valueText: { type: String, default: "" },                   // as typed on the board ('$1.84m') when no exact amount
  changeNote: { type: String, default: "" },
  feature: { type: Boolean, default: false },
}, { _id: false });

const unitSnapshotSchema = new Schema({
  unitCode: { type: String, required: true },
  buildingProject: { type: String, default: "" },
  progressPct: { type: Number, default: 0 },
  loanBalanceText: { type: String, default: "" },
  paymentsText: { type: String, default: "" },
  staffingNote: { type: String, default: "" },
  enrolmentNote: { type: String, default: "" },
  enrolLabel: { type: String, default: "" },
  enrolTrend: { type: [Number], default: [] },
}, { _id: false });

const boardItemSchema = new Schema({
  kind: { type: String, enum: ["RISK", "WHS", "CELEBRATION"], required: true },
  rating: { ...rating, default: null },
  title: { type: String, required: true },
  detail: { type: String, default: "" },
  displayOrder: { type: Number, default: 0 },
}, { _id: false });

const weeklyBoardSchema = new Schema({
  organisationId: { type: Schema.Types.ObjectId, ref: "Organisation", required: true },
  weekEnding: { type: Date, required: true },
  weekEndingLabel: { type: String, required: true },          // 'Friday 20 June 2026'
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
  publishedAt: { type: Date, default: null },
  healthRatings: { type: [healthRatingSchema], default: [] },
  cashItems: { type: [cashItemSchema], default: [] },
  unitSnapshots: { type: [unitSnapshotSchema], default: [] },
  items: { type: [boardItemSchema], default: [] },
}, { timestamps: true });
weeklyBoardSchema.index({ organisationId: 1, weekEnding: 1 }, { unique: true });
export type WeeklyBoard = InferSchemaType<typeof weeklyBoardSchema>;
export const WeeklyBoardModel = model("WeeklyBoard", weeklyBoardSchema, "weekly_boards");

const enrolmentCensusSchema = new Schema({
  operatingUnitId: { type: Schema.Types.ObjectId, ref: "OperatingUnit", required: true },
  censusDate: { type: Date, required: true },
  headcount: { type: Number, required: true },
  occupancyPct: { type: Number, default: null },
  sourceSystem: { type: String, enum: SOURCE_SYSTEMS, default: "MANUAL" },
});
enrolmentCensusSchema.index({ operatingUnitId: 1, censusDate: 1 }, { unique: true });
export type EnrolmentCensus = InferSchemaType<typeof enrolmentCensusSchema>;
export const EnrolmentCensusModel = model("EnrolmentCensus", enrolmentCensusSchema, "enrolment_census");
