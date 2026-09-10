import { handle } from "@/lib/http";
import { postPdfImport } from "@/controllers/imports";
export const POST = handle(async (req: Request) => postPdfImport(req));
