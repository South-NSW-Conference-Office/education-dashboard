import { guarded } from "@/lib/access";
import { getLineItems, patchLines } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const GET = guarded("boards.read", async (req: Request, ctx: Params<"unit">) => getLineItems(req, (await ctx.params).unit));
export const PATCH = guarded("boards.edit", async (req: Request, ctx: Params<"unit">) => patchLines(req, (await ctx.params).unit));
