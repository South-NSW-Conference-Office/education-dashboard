/** Databoard controllers. */
import { ok, parseBody, query } from "@/lib/http";
import { presentDataboard } from "@/presenters/databoard";
import { boardFor, latestBoard, publishBoard, saveBoard, type WeeklyBoardDoc } from "@/services/databoard";
import { loadAllBoards } from "@/services/financeQuery";
import { listUnits } from "@/services/structure";
import { databoardSchema } from "./schemas";
import { notFound } from "@/lib/http";

async function present(board: WeeklyBoardDoc) {
  const [units, finance] = await Promise.all([listUnits(), loadAllBoards({ versionMode: "LATEST_APPROVED" })]);
  return presentDataboard(board, units, finance);
}

export async function getLatest() {
  const b = await latestBoard(true);
  if (!b) throw notFound("A weekly databoard");
  return ok(await present(b));
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
