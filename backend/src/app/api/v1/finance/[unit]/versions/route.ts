import { handle, type Params } from "@/lib/http";
import { getVersions, postVersion } from "@/controllers/finance";
export const GET = handle(async (req: Request, ctx: Params<"unit">) => getVersions(req, (await ctx.params).unit));
export const POST = handle(async (req: Request, ctx: Params<"unit">) => postVersion(req, (await ctx.params).unit));
