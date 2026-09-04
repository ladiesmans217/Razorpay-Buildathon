import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockPrivacyDecision } from "@/lib/ai/mocks";
import { privacyPrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const data = await generateJson(privacyPrompt(body), mockPrivacyDecision);
  return NextResponse.json(data);
}
