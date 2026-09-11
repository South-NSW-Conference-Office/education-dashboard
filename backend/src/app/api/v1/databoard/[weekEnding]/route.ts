import { editOrPublish, guarded } from "@/lib/access";
import { getWeek, putWeek } from "@/controllers/databoard";
import { type Params } from "@/lib/http";
export const GET = guarded("boards.read", async (req: Request, ctx: Params<"weekEnding">) => getWeek(req, decodeURIComponent((await ctx.params).weekEnding)));
export const PUT = guarded(editOrPublish, async (req: Request, ctx: Params<"weekEnding">) => putWeek(req, decodeURIComponent((await ctx.params).weekEnding)));
