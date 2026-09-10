import { handle } from "@/lib/http";
import { getPeriods } from "@/controllers/finance";
export const GET = handle(async () => getPeriods());
