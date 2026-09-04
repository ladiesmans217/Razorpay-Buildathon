import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    transcript: body.transcript || "Lakshmi: Did you eat lunch? Please take your medicine after food.",
    source: body.audio ? "audio-demo" : "typed-demo"
  });
}
