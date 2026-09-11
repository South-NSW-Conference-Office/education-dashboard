import { guarded } from "@/lib/access";
import { postPublish } from "@/controllers/databoard";
import { type Params } from "@/lib/http";
export const POST = guarded("boards.publish", async (req: Request, ctx: Params<"weekEnding">) => postPublish(req, decodeURIComponent((await ctx.params).weekEnding)));
