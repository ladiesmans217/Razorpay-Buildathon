import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockConversationSummary } from "@/lib/ai/mocks";
import { conversationPrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const transcript = body.transcript || "Lakshmi: Did you eat lunch? Please take your medicine after food.";
  const data = await generateJson(conversationPrompt(transcript, body.person || "Lakshmi"), mockConversationSummary);
  return NextResponse.json(data);
}
