import { guarded } from "@/lib/access";
import { getTimeline } from "@/controllers/finance";
export const GET = guarded("boards.read", async (req: Request) => getTimeline(req));
