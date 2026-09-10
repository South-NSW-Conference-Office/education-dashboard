import { handle } from "@/lib/http";
import { listImports, postImport } from "@/controllers/imports";
export const GET = handle(async () => listImports());
export const POST = handle(async (req: Request) => postImport(req));
