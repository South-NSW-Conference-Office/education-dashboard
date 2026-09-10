import { handle } from "@/lib/http";
import { getUnits } from "@/controllers/finance";
export const GET = handle(async () => getUnits());
