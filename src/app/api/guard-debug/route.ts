import { NextResponse } from "next/server";

const recentLogs: Array<{
  title: string;
  detail: string;
  timestamp: string;
  source: string;
}> = [];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const entry = {
    title: String(body.title || "guard"),
    detail: String(body.detail || ""),
    timestamp: String(body.timestamp || new Date().toISOString()),
    source: String(body.source || "unknown")
  };
  recentLogs.unshift(entry);
  recentLogs.splice(40);
  console.log(`[GuardDebug] ${entry.timestamp} ${entry.title}: ${entry.detail}`);
  return NextResponse.json({ ok: true, entry }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return NextResponse.json({ ok: true, logs: recentLogs }, { headers: { "Cache-Control": "no-store" } });
}
