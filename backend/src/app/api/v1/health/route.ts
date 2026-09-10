import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { db } from "@/lib/db";

export async function GET() {
  try { await db(); return NextResponse.json({ ok: true, mongo: mongoose.connection.readyState === 1 ? "connected" : "connecting", time: new Date().toISOString() }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 }); }
}
