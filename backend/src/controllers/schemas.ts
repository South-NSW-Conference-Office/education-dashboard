/** Request validation (Zod). Loose on purpose where the frontend sends extra, derived fields — those are ignored on write. */
import { z } from "zod";

const num = z.coerce.number().default(0);
const line = z.object({ code: z.string().default(""), label: z.string().min(1), budget: num, actual: num, annualBudget: num, eoyEstimate: num }).passthrough();
const group = z.object({ group: z.string().min(1), rows: z.array(line).default([]) }).passthrough();
const category = z.object({ label: z.string().min(1), budget: num, actual: num, annualBudget: num, eoyEstimate: num, sub: z.array(z.object({ label: z.string(), budget: num, actual: num, annualBudget: num, eoyEstimate: num }).passthrough()).optional() }).passthrough();
const obligation = z.object({ name: z.string().default(""), payment: num, frequency: z.string().default(""), ends: z.string().default(""), notes: z.string().default("") }).passthrough();

export const boardDocumentSchema = z.object({
  meta: z.object({ asAt: z.string().min(1), draft: z.boolean().optional() }).passthrough(),
  addback: z.object({ ytdBudget: num, ytdActual: num }).default({ ytdBudget: 0, ytdActual: 0 }),
  priorYear: z.object({ debtorsCurrent: num, debtorsPrior: num, note: z.string().default("") }).default({ debtorsCurrent: 0, debtorsPrior: 0, note: "" }),
  loans: z.array(obligation).default([]),
  leases: z.array(obligation).default([]),
  comments: z.object({ current: z.string().default(""), upcoming: z.string().default("") }).default({ current: "", upcoming: "" }),
  income: z.array(category).default([]),
  expenditure: z.array(category).default([]),
  details: z.object({ income: z.array(group).default([]), expenditure: z.array(group).default([]) }),
}).passthrough();
export type BoardDocumentBody = z.infer<typeof boardDocumentSchema>;

export const lineItemPatchSchema = z.object({
  periodLabel: z.string().optional(),
  upserts: z.array(z.object({
    section: z.enum(["INCOME", "EXPENDITURE"]), group: z.string().min(1), code: z.string().optional(), label: z.string().min(1),
    budget: z.coerce.number().optional(), actual: z.coerce.number().optional(), annualBudget: z.coerce.number().optional(), eoyEstimate: z.coerce.number().optional(),
  })).default([]),
  deletes: z.array(z.object({ code: z.string().optional(), label: z.string().optional() })).default([]),
});

const rating = z.enum(["green", "amber", "red"]).optional();
export const databoardSchema = z.object({
  weekEnding: z.string().min(1),
  cash: z.array(z.object({ kind: z.string().optional(), label: z.string(), value: z.string().default(""), delta: z.string().default(""), feature: z.boolean().optional() }).passthrough()).default([]),
  matrix: z.array(z.object({
    unit: z.string().optional(), id: z.string().optional(), theme: z.string().optional(), school: z.string().optional(), sub: z.string().optional(),
    status: z.object({ overall: rating, finance: rating, enrolments: rating, staffing: rating, buildings: rating, whs: rating }).partial().default({}),
    notes: z.record(z.string(), z.string()).default({}),
  }).passthrough()).default([]),
  schools: z.array(z.object({
    unit: z.string().optional(), id: z.string().optional(), theme: z.string().optional(), name: z.string().optional(),
    project: z.string().default(""), progress: z.coerce.number().default(0), loan: z.string().default(""), payments: z.string().default(""),
    staffing: z.string().default(""), enrolments: z.string().default(""), enrolLabel: z.string().default(""), enrolTrend: z.array(z.coerce.number()).default([]),
  }).passthrough()).default([]),
  risks: z.array(z.object({ rating, main: z.string(), meta: z.string().default("") }).passthrough()).default([]),
  whs: z.array(z.object({ rating, main: z.string(), meta: z.string().default("") }).passthrough()).default([]),
  celebrate: z.array(z.object({ main: z.string(), meta: z.string().default("") }).passthrough()).default([]),
}).passthrough();

export const importCreateSchema = z.object({
  unit: z.string().min(1),
  sourceSystem: z.enum(["MANUAL", "MYOB", "SYNERGETIC", "HUBWORKS"]).default("MANUAL"),
  fileName: z.string().optional(),
  board: boardDocumentSchema,
});

export const resolveSchema = z.object({ status: z.enum(["RESOLVED", "WAIVED"]).default("RESOLVED"), explanation: z.string().min(1) });
export const rejectSchema = z.object({ reason: z.string().optional() });
