import { guarded } from "@/lib/access";
import { postSubmit } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const POST = guarded("boards.edit", async (req: Request, ctx: Params<"unit" | "id">) => { const p = await ctx.params; return postSubmit(req, p.unit, p.id); });
