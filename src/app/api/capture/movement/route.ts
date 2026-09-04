import { NextResponse } from "next/server";
import {
  addCaptureMemoryEvent,
  addSessionToState,
  createCaptureSession,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  publishCaptureCue,
  transitionSession,
  updateSessionInState
} from "@/lib/capture-server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";
import type { MemoryEvent } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = new Date().toISOString();
  const cue = await publishCaptureCue({
    cue: "I noticed you may be moving. Memory Guard is on, but I will ask before saving anything.",
    should_vibrate: false
  });

  const { stored, result } = await mutateCareState((state) => {
    const existing = latestOpenCaptureSession(state);
    const session = existing
      ? transitionSession(
          {
            ...existing,
            status: "movement_detected",
            movement_source: body.movement_source || existing.movement_source || "gps",
            location: body.location || existing.location
          },
          "movement_detected",
          "Movement signal received from watch or phone.",
          "system"
        )
      : createCaptureSession({
          patient_id: body.patient_id || DEMO_PATIENT_ID,
          trigger: "movement_speech_detected",
          status: "movement_detected",
          source_device: body.source_device || "wearos",
          movement_source: body.movement_source || "gps",
          location: body.location,
          started_at: timestamp
        });

    const event: MemoryEvent = {
      id: uid("event_capture_move"),
      patient_id: session.patient_id,
      event_type: "ambient_conversation_detected",
      timestamp,
      source: "capture",
      location: eventLocation(session),
      people_involved: ["Rajamma"],
      summary: "Memory Guard detected movement. No media was saved.",
      risk_score: 8,
      privacy_level: "caregiver_only",
      retention_policy: "24_hours",
      action_items: ["Wait for meaningful speech before asking for consent."]
    };

    const withSession = existing ? updateSessionInState(state, existing.id, () => session) : addSessionToState(state, session);
    return {
      state: { ...addCaptureMemoryEvent(withSession, event), latestWatchCue: cue },
      result: { session, event }
    };
  });

  return NextResponse.json({ ok: true, stored, ...result, watch_cue: cue });
}
