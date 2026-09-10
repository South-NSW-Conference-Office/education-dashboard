import { handle, type Params } from "@/lib/http";
import { getOverview } from "@/controllers/finance";
export const GET = handle(async (req: Request, ctx: Params<"unit">) => getOverview(req, (await ctx.params).unit));
