import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockTrainingCard } from "@/lib/ai/mocks";
import { trainingPrompt } from "@/lib/ai/prompts";
import type { Role } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const role = (body.role || "neighbour") as Role;
  const useCase = body.use_case || "wandering";
  const eventContext = body.event_context || "Rajamma left safe zone near MSRIT gate.";
  const data = await generateJson(trainingPrompt(role, useCase, eventContext), mockTrainingCard);
  return NextResponse.json(data);
}
