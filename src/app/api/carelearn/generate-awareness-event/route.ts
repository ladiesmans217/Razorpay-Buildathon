import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockAwarenessEvent } from "@/lib/ai/mocks";
import { awarenessPrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const recentEvents = body.recent_events || "Safe zone exit near MSRIT gate; neighbour CareLearn training pending.";
  const data = await generateJson(awarenessPrompt(recentEvents), mockAwarenessEvent);
  return NextResponse.json(data);
}
