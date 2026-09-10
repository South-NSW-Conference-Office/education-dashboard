import { handle } from "@/lib/http";
import { getTimeline } from "@/controllers/finance";
export const GET = handle(async (req: Request) => getTimeline(req));
