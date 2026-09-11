import { guarded } from "@/lib/access";
import { getVersions, postVersion } from "@/controllers/finance";
import { type Params } from "@/lib/http";
export const GET = guarded("boards.read", async (req: Request, ctx: Params<"unit">) => getVersions(req, (await ctx.params).unit));
export const POST = guarded("boards.edit", async (req: Request, ctx: Params<"unit">) => postVersion(req, (await ctx.params).unit));
