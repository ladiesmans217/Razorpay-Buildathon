import { NextResponse } from "next/server";
import { loadCareState } from "@/lib/watch-sync-server";

export async function GET() {
  const state = await loadCareState();
  return NextResponse.json(
    {
      ok: true,
      command: state.latestCaptureCommand || null,
      received_at: new Date().toISOString()
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
