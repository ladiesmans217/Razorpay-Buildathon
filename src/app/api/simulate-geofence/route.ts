import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockWanderingAssessment } from "@/lib/ai/mocks";
import { wanderingPrompt } from "@/lib/ai/prompts";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const data = await generateJson(
    wanderingPrompt({
      location: "MSRIT gate",
      safe_zone_radius: "500m",
      distance_from_home: "520m",
      time: "11:42 AM",
      nearest_safe_place: "Lakshmi neighbour, 120m away",
      response_status: "patient has not acknowledged yet",
      ...body
    }),
    mockWanderingAssessment
  );
  return NextResponse.json(data);
}
