import { guarded } from "@/lib/access";
import { postResolve } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const POST = guarded("boards.edit", async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postResolve(req, p.unit, p.id); });
