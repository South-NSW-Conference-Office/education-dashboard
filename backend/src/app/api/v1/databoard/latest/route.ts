import { guarded } from "@/lib/access";
import { getLatest } from "@/controllers/databoard";
export const GET = guarded("boards.read", async (req: Request) => getLatest(req));
