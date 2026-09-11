import { guarded } from "@/lib/access";
import { getPeriods } from "@/controllers/finance";
export const GET = guarded("boards.read", async (_req: Request) => getPeriods());
