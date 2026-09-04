import { NextResponse } from "next/server";
import { appendWearEvent } from "@/lib/watch-sync-server";
import type { WearEvent } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const event: WearEvent = {
    id: body.id || `wear_${Date.now()}`,
    patient_id: body.patient_id || "patient_rajamma",
    type: "ok_checkin",
    timestamp: body.timestamp || new Date().toISOString(),
    message: body.message || "Rajamma tapped I'm okay on Galaxy Watch."
  };
  const { stored } = await appendWearEvent(event);
  return NextResponse.json({
    ok: true,
    stored,
    type: "ok_checkin",
    patient_id: event.patient_id,
    message: "Watch check-in received. Caregiver dashboard can mark the patient as responsive.",
    event,
    received_at: new Date().toISOString()
  });
}
