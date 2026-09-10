import { handle } from "@/lib/http";
import { getLatest } from "@/controllers/databoard";
export const GET = handle(async () => getLatest());
