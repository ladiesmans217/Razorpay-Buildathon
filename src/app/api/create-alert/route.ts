import { NextResponse } from "next/server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    id: uid("alert"),
    patient_id: body.patient_id || DEMO_PATIENT_ID,
    alert_type: body.alert_type || "safe_zone_exit",
    severity: body.severity || "medium",
    message: body.message || "CareGrid alert created.",
    recipients: body.recipients || ["caregiver"],
    status: "pending",
    created_at: new Date().toISOString(),
    linked_memory_event_id: body.linked_memory_event_id || ""
  });
}
