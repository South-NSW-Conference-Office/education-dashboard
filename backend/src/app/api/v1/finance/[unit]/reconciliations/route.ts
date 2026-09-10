import { handle, type Params } from "@/lib/http";
import { getReconciliations } from "@/controllers/finance";
export const GET = handle(async (req: Request, ctx: Params<"unit">) => getReconciliations(req, (await ctx.params).unit));
