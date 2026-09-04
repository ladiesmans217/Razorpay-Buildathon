import { NextResponse } from "next/server";
import { appendWearEvent } from "@/lib/watch-sync-server";
import type { WearEvent } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = new Date().toISOString();
  const event: WearEvent = {
    id: body.id || `wear_sos_manual_${Date.now()}`,
    patient_id: body.patient_id || "patient_rajamma",
    type: body.type === "bystander_help" ? "bystander_help" : "notify_caregiver",
    timestamp,
    message:
      body.message ||
      body.reason ||
      "SOS requested from RememberMe CareGrid. Patient may need caregiver support.",
    latitude: typeof body.latitude === "number" ? body.latitude : undefined,
    longitude: typeof body.longitude === "number" ? body.longitude : undefined
  };
  const result = await appendWearEvent(event);
  return NextResponse.json({
    ok: true,
    stored: result.stored,
    event,
    geofence: result.geofence,
    sos_delivery: result.sosDelivery,
    message: result.sosDelivery?.enabled
      ? "SOS sent through Twilio."
      : "SOS recorded. Twilio is not configured, so this is simulated for demo.",
    received_at: timestamp
  });
}
