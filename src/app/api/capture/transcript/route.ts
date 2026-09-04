import { NextResponse } from "next/server";
import {
  addCaptureMemoryEvent,
  addMediaToState,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  publishCaptureCue,
  transitionSession,
  updateSessionInState
} from "@/lib/capture-server";
import { uid } from "@/lib/utils";
import type { CaptureMedia, CaptureSession, MemoryEvent } from "@/lib/types";

type TranscriptResult = {
  error?: string;
  media: CaptureMedia | null;
  session: CaptureSession | null;
  event: MemoryEvent | null;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const transcript = String(body.transcript || "").trim();
  const timestamp = new Date().toISOString();

  const { stored, result } = await mutateCareState<TranscriptResult>((state) => {
    const session = (body.session_id ? state.captureSessions.find((item) => item.id === body.session_id) : latestOpenCaptureSession(state)) || null;
    if (!session) return { state, result: { error: "No active capture session.", media: null, session: null, event: null } };
    if (!session.consent.transcript) return { state, result: { error: "Transcript consent has not been recorded.", media: null, session, event: null } };
    if (!transcript) return { state, result: { error: "Transcript is empty.", media: null, session, event: null } };

    const media: CaptureMedia = {
      id: body.id || uid("capture_transcript"),
      patient_id: session.patient_id,
      session_id: session.id,
      kind: "transcript",
      captured_at: body.captured_at || timestamp,
      transcript_text: transcript,
      location: body.location || session.location,
      metadata: {
        source_device: body.source_device || "android_phone",
        consent_status: "consented",
        retained_until: body.retained_until,
        face_status: "not_processed"
      },
      privacy_level: session.privacy_level,
      retention_policy: "saved"
    };

    const event: MemoryEvent = {
      id: uid("event_capture_transcript"),
      patient_id: session.patient_id,
      event_type: "consented_transcript_saved",
      timestamp,
      source: "capture",
      location: eventLocation(session),
      people_involved: session.person_name ? [session.person_name] : ["Rajamma"],
      summary: `A consented conversation transcript was saved for ${session.person_name || "a new person"}.`,
      raw_transcript: transcript,
      risk_score: session.risk_score,
      privacy_level: session.privacy_level,
      retention_policy: "saved",
      action_items: ["Summarize when the patient says the conversation ended."]
    };

    const nextSession = transitionSession({ ...session, status: "recording" }, "recording", "Transcript chunk saved.", "system");
    return {
      state: addCaptureMemoryEvent(addMediaToState(updateSessionInState(state, session.id, () => nextSession), media), event),
      result: { media, session: nextSession, event }
    };
  });

  if (result.error) return NextResponse.json({ ok: false, stored, ...result }, { status: 200 });

  const watchCue = await publishCaptureCue({
    cue: "I saved this part of the conversation. Say conversation ended when I should summarize it.",
    person_name: result.session?.person_name,
    should_vibrate: false
  });
  await mutateCareState((state) => ({ state: { ...state, latestWatchCue: watchCue }, result: null }));

  return NextResponse.json({ ok: true, stored, ...result, watch_cue: watchCue });
}
