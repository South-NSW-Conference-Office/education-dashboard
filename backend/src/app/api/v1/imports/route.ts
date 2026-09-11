import { guarded, importPerm } from "@/lib/access";
import { listImports, postImport } from "@/controllers/imports";
export const GET = guarded("boards.read", async (_req: Request) => listImports());
export const POST = guarded(importPerm, async (req: Request) => postImport(req));
