import { NextResponse } from "next/server";
import { appendWearEvent } from "@/lib/watch-sync-server";
import type { WearEvent } from "@/lib/types";

function parseCoord(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const latitude = parseCoord(body.latitude);
  const longitude = parseCoord(body.longitude);
  const hasFix = typeof latitude === "number" && typeof longitude === "number";

  const event: WearEvent = {
    id: body.id || `wear_${Date.now()}`,
    patient_id: body.patient_id || "patient_rajamma",
    type: "location_ping",
    timestamp: body.timestamp || new Date().toISOString(),
    message:
      body.message ||
      (hasFix ? "Galaxy Watch GPS ping received." : "Galaxy Watch GPS ping received without coordinates."),
    latitude,
    longitude
  };
  const { stored, geofence, sosDelivery } = await appendWearEvent(event);
  return NextResponse.json({
    ok: true,
    stored,
    type: "location_ping",
    patient_id: event.patient_id,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    has_fix: hasFix,
    message: !hasFix
      ? "Watch ping stored, but no lat/lng was sent — map will not move."
      : geofence?.should_sos
        ? "Watch GPS ping received. SOS workflow triggered."
        : "Watch GPS ping received.",
    geofence,
    sos_delivery: sosDelivery,
    event,
    received_at: new Date().toISOString()
  });
}
