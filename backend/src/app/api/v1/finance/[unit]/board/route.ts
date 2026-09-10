import { handle, type Params } from "@/lib/http";
import { getBoard, putBoard } from "@/controllers/finance";
export const GET = handle(async (req: Request, ctx: Params<"unit">) => getBoard(req, (await ctx.params).unit));
export const PUT = handle(async (req: Request, ctx: Params<"unit">) => putBoard(req, (await ctx.params).unit));
