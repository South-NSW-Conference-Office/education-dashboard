import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { db } from "@/lib/db";

export async function GET() {
  try { await db(); return NextResponse.json({ ok: true, mongo: mongoose.connection.readyState === 1 ? "connected" : "connecting", time: new Date().toISOString() }); }
  catch (e) { console.error(e); return NextResponse.json({ ok: false }, { status: 503 }); }
}
