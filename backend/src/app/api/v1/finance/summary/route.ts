import { handle } from "@/lib/http";
import { getSummary } from "@/controllers/finance";
export const GET = handle(async (req: Request) => getSummary(req));
