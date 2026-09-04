import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    alert_id: body.alert_id,
    status: "resolved",
    resolved_at: new Date().toISOString()
  });
}
