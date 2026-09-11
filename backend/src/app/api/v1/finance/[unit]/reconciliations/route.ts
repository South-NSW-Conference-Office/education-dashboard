import { guarded } from "@/lib/access";
import { getReconciliations } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const GET = guarded("boards.read", async (req: Request, ctx: Params<"unit">) => getReconciliations(req, (await ctx.params).unit));
