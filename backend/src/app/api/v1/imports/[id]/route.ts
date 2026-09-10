import { handle, type Params } from "@/lib/http";
import { getImport } from "@/controllers/imports";
export const GET = handle(async (req: Request, ctx: Params<"id">) => getImport(req, (await ctx.params).id));
