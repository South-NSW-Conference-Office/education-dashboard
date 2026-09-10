import { handle, type Params } from "@/lib/http";
import { publishImport } from "@/controllers/imports";
export const POST = handle(async (req: Request, ctx: Params<"id">) => publishImport(req, (await ctx.params).id));
