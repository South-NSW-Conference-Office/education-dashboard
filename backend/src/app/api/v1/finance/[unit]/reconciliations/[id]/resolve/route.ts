import { handle, type Params } from "@/lib/http";
import { postResolve } from "@/controllers/finance";
export const POST = handle(async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postResolve(req, p.unit, p.id); });
