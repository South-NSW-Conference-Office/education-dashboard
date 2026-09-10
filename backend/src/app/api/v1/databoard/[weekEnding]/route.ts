import { handle, type Params } from "@/lib/http";
import { getWeek, putWeek } from "@/controllers/databoard";
export const GET = handle(async (req: Request, ctx: Params<"weekEnding">) => getWeek(req, decodeURIComponent((await ctx.params).weekEnding)));
export const PUT = handle(async (req: Request, ctx: Params<"weekEnding">) => putWeek(req, decodeURIComponent((await ctx.params).weekEnding)));
