import { guarded, importPerm } from "@/lib/access";
import { postPdfImport } from "@/controllers/imports";
export const POST = guarded(importPerm, async (req: Request) => postPdfImport(req));
