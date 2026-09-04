import { NextResponse } from "next/server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    id: body.id || uid("event"),
    patient_id: body.patient_id || DEMO_PATIENT_ID,
    timestamp: body.timestamp || new Date().toISOString(),
    ...body
  });
}
