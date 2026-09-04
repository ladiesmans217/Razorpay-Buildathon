import { NextResponse } from "next/server";
import { appendWearEvent } from "@/lib/watch-sync-server";
import type { WearEvent } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const type = body.type === "alert_acknowledged" ? "alert_acknowledged" : "notify_caregiver";
  const event: WearEvent = {
    id: body.id || `wear_${Date.now()}`,
    patient_id: body.patient_id || "patient_rajamma",
    type,
    timestamp: body.timestamp || new Date().toISOString(),
    message:
      body.message ||
      (type === "alert_acknowledged"
        ? "Wandering alert acknowledged on Galaxy Watch."
        : "Rajamma tapped notify caregiver on Galaxy Watch.")
  };
  const { stored, sosDelivery } = await appendWearEvent(event);
  const sms = sosDelivery?.sms;
  const call = sosDelivery?.call;
  const delivered = sms === "sent" || call === "sent";
  const message =
    type === "alert_acknowledged"
      ? "Alert acknowledged."
      : delivered
        ? `Caregiver notified (SMS: ${sms || "n/a"}, call: ${call || "n/a"}).`
        : sosDelivery?.error ||
          `Notify recorded but no SMS/call yet (SMS: ${sms || "n/a"}, call: ${call || "n/a"}). Check Twilio.`;

  return NextResponse.json({
    ok: true,
    stored,
    type,
    patient_id: event.patient_id,
    message,
    sos_delivery: sosDelivery,
    event,
    received_at: new Date().toISOString()
  });
}
