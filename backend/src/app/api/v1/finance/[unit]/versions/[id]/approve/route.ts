import { guarded } from "@/lib/access";
import { postApprove } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const POST = guarded("boards.publish", async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postApprove(req, p.unit, p.id); });
