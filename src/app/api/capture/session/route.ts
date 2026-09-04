import { NextResponse } from "next/server";
import { addSessionToState, createCaptureSession, mutateCareState, publishCaptureCue } from "@/lib/capture-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const session = createCaptureSession({
    patient_id: body.patient_id,
    trigger: body.trigger || "demo",
    status: body.status || "movement_detected",
    source_device: body.source_device || "android_phone",
    movement_source: body.movement_source || "manual",
    location: body.location,
    speech_snippet: body.speech_snippet,
    risk_score: Number(body.risk_score ?? 12),
    consent: body.consent,
    privacy_level: body.privacy_level,
    retention_policy: body.retention_policy
  });

  const cue = await publishCaptureCue({
    cue: "Memory Guard is ready. I will ask before saving any name, photo, or conversation.",
    should_vibrate: false
  });

  const { stored } = await mutateCareState((state) => ({
    state: { ...addSessionToState(state, session), latestWatchCue: cue },
    result: session
  }));

  return NextResponse.json({ ok: true, stored, session, watch_cue: cue });
}
