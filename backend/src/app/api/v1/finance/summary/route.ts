import { guarded } from "@/lib/access";
import { getSummary } from "@/controllers/finance";
export const GET = guarded("boards.read", async (req: Request) => getSummary(req));
