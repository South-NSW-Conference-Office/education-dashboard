import { guarded } from "@/lib/access";
import { postReject } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const POST = guarded("boards.publish", async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postReject(req, p.unit, p.id); });
