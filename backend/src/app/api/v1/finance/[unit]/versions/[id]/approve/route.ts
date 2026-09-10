import { handle, type Params } from "@/lib/http";
import { postApprove } from "@/controllers/finance";
export const POST = handle(async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postApprove(req, p.unit, p.id); });
