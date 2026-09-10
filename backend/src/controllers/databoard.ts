/** Databoard controllers. */
import { ok, parseBody, query } from "@/lib/http";
import { presentDataboard } from "@/presenters/databoard";
import { boardFor, latestBoard, publishBoard, saveBoard, type WeeklyBoardDoc } from "@/services/databoard";
import { describeScope, loadAllBoards, type ReadOptions } from "@/services/financeQuery";
import { listUnits, parsePeriodLabel, periodsBetween } from "@/services/structure";
import { databoardSchema } from "./schemas";
import { notFound } from "@/lib/http";
import { readOptions } from "./finance";

async function present(board: WeeklyBoardDoc, scope: ReadOptions = {}) {
  const [units, finance] = await Promise.all([listUnits(), loadAllBoards({ ...scope, versionMode: "LATEST_APPROVED" })]);
  return presentDataboard(board, units, finance);
}

/**
 * The newest weekly board, or with a period selected the newest whose week ended inside or before it.
 * The finance-derived figures follow the same period, so the whole page reads as at that time.
 */
export async function getLatest(req: Request) {
  const scope = readOptions(req);
  const end = scope.periodLabel ?? scope.to;
  const upTo = end ? (await periodsBetween(end, end))[0]?.endsOn ?? monthEnd(end) : undefined;
  const b = await latestBoard(true, upTo);
  if (!b) throw notFound(`A weekly databoard${end ? ` as at ${describeScope(scope)}` : ""}`);
  return ok(await present(b, scope));
}
/** Last day of a "June 2026" month, for a year the calendar has not been created for yet. */
function monthEnd(label: string): Date {
  const { year, month } = parsePeriodLabel(label);
  return new Date(Date.UTC(year, month, 0));
}
export async function getWeek(_req: Request, weekEnding: string) {
  return ok(await present(await boardFor(weekEnding)));
}
/** Save the raw fields for a week; `?publish=true` publishes in the same call. */
export async function putWeek(req: Request, weekEnding: string) {
  const body = await parseBody(req, databoardSchema);
  const publish = query(req).get("publish") === "true";
  const saved = await saveBoard({ ...body, weekEnding: body.weekEnding || weekEnding } as never, { publish });
  return ok(await present(saved));
}
export async function postPublish(_req: Request, weekEnding: string) {
  return ok(await present(await publishBoard(weekEnding)));
}
