import { NextResponse } from "next/server";
import { saveHealthSnapshot } from "@/lib/watch-sync-server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import type { HealthSnapshot } from "@/lib/types";
import { uid } from "@/lib/utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const snapshot: HealthSnapshot = {
    id: body.id || uid("health"),
    patient_id: body.patient_id || DEMO_PATIENT_ID,
    steps_today: numberOr(body.steps_today, 2840),
    distance_m: numberOr(body.distance_m, 1860),
    active_minutes: numberOr(body.active_minutes, 32),
    latest_heart_rate_bpm: optionalNumber(body.latest_heart_rate_bpm, 78),
    resting_heart_rate_bpm: optionalNumber(body.resting_heart_rate_bpm, 72),
    sleep_minutes: optionalNumber(body.sleep_minutes, 385),
    sleep_quality_label: body.sleep_quality_label || "fair",
    calories: optionalNumber(body.calories, 1460),
    source: body.source || "mixed",
    mocked_fields: Array.isArray(body.mocked_fields)
      ? body.mocked_fields.map(String)
      : ["sleep_minutes", "sleep_quality_label", "resting_heart_rate_bpm", "calories"],
    captured_at: body.captured_at || new Date().toISOString()
  };

  const { stored, event } = await saveHealthSnapshot(snapshot);
  return NextResponse.json({ ok: true, stored, snapshot, event });
}

function numberOr(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
