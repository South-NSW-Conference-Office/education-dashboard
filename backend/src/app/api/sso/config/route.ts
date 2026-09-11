/** What the SPA needs before anyone is signed in: whether SSO is on and what to call it. */
import { NextResponse } from "next/server";
import { enterpriseSso } from "@/lib/sso";

export async function GET() {
  return NextResponse.json({
    enabled: enterpriseSso.enabled,
    providerId: enterpriseSso.providerId,
    displayName: enterpriseSso.displayName,
    portalUrl: enterpriseSso.portalUrl,
  });
}
