import { guarded, importPerm } from "@/lib/access";
import { publishImport } from "@/controllers/imports";
import { type Params } from "@/lib/http";
export const POST = guarded(importPerm, async (req: Request, ctx: Params<"id">) => publishImport(req, (await ctx.params).id));
