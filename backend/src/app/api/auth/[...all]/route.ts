/** Better Auth's own surface: the enterprise-sso OAuth callback, session reads, sign-out. */
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
