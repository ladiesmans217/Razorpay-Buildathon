import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    received_at: new Date().toISOString(),
    frame_id: body.frame?.id || null,
    note:
      "Frame accepted. In Firebase mode the client store syncs the latest frame across devices; without Firebase it remains a local demo fallback."
  });
}
