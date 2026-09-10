import { handle, type Params } from "@/lib/http";
import { postPublish } from "@/controllers/databoard";
export const POST = handle(async (req: Request, ctx: Params<"weekEnding">) => postPublish(req, decodeURIComponent((await ctx.params).weekEnding)));
