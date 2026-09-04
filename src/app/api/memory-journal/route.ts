import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockMemoryJournal } from "@/lib/ai/mocks";
import { memoryJournalPrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const transcript = body.transcript || "I remember going to Mysore with my husband.";
  const data = await generateJson(memoryJournalPrompt(transcript), mockMemoryJournal);
  return NextResponse.json(data);
}
