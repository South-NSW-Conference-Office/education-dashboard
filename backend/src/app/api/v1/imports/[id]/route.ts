import { guarded } from "@/lib/access";
import { getImport } from "@/controllers/imports";
import { type Params } from "@/lib/http";
export const GET = guarded("boards.read", async (req: Request, ctx: Params<"id">) => getImport(req, (await ctx.params).id));
