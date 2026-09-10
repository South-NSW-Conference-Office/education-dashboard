import { handle, type Params } from "@/lib/http";
import { getLineItems, patchLines } from "@/controllers/finance";
export const GET = handle(async (req: Request, ctx: Params<"unit">) => getLineItems(req, (await ctx.params).unit));
export const PATCH = handle(async (req: Request, ctx: Params<"unit">) => patchLines(req, (await ctx.params).unit));
