import { guarded } from "@/lib/access";
import { getUnits } from "@/controllers/finance";
export const GET = guarded("boards.read", async (_req: Request) => getUnits());
