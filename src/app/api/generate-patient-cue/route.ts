import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockPatientCue } from "@/lib/ai/mocks";
import { patientCuePrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const context =
    body.context ||
    "Lakshmi is Rajamma's trusted neighbour from downstairs. They met yesterday near the temple. Lakshmi reminded Rajamma about lunch and medicine.";
  const data = await generateJson(patientCuePrompt(context), mockPatientCue);
  return NextResponse.json(data);
}
