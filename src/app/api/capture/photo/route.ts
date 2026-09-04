import { NextResponse } from "next/server";
import {
  addCaptureMemoryEvent,
  addMediaToState,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  publishCaptureCue,
  updateSessionInState
} from "@/lib/capture-server";
import { uid } from "@/lib/utils";
import type { CaptureMedia, CaptureSession, MemoryEvent } from "@/lib/types";

type PhotoResult = {
  error?: string;
  media: CaptureMedia | null;
  session: CaptureSession | null;
  event: MemoryEvent | null;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = new Date().toISOString();

  const { stored, result } = await mutateCareState<PhotoResult>((state) => {
    const session = (body.session_id ? state.captureSessions.find((item) => item.id === body.session_id) : latestOpenCaptureSession(state)) || null;
    if (!session) {
      return {
        state,
        result: { error: "No active capture session.", media: null, session: null, event: null }
      };
    }
    const faceStatus = String(body.face_status || "");
    const isFrontIdentification =
      session.trigger === "manual_who_is_this" ||
      body.front_identification === true ||
      body.front_identification === "true" ||
      ["matched", "unknown", "no_face"].includes(faceStatus) ||
      (body.source_device === "android_phone" && Boolean(body.face_status)) ||
      Boolean(
        body.command_id &&
          state.latestCaptureCommand?.id === body.command_id &&
          state.latestCaptureCommand?.command === "capture_front_person"
      );
    // Ambient capture still requires photo consent. Guard / who-is-this never does.
    if (!session.consent.photo && !isFrontIdentification) {
      return {
        state,
        result: { error: "Photo consent has not been recorded.", media: null, session, event: null }
      };
    }

    const media: CaptureMedia = {
      id: body.id || uid("capture_photo"),
      patient_id: session.patient_id,
      session_id: session.id,
      kind: "photo",
      captured_at: body.captured_at || timestamp,
      storage_path: body.storage_path,
      media_url: body.media_url || body.data_url,
      linked_person_id: body.linked_person_id || session.linked_person_id,
      location: body.location || session.location,
      metadata: {
        source_device: body.source_device || "android_phone",
        consent_status: isFrontIdentification ? "candidate" : "consented",
        retained_until: body.retained_until,
        face_status: body.face_status || "not_processed"
      },
      privacy_level: isFrontIdentification ? "caregiver_only" : session.privacy_level,
      retention_policy: isFrontIdentification ? "24_hours" : session.retention_policy
    };

    const event: MemoryEvent = {
      id: uid("event_capture_photo"),
      patient_id: session.patient_id,
      event_type: isFrontIdentification ? "front_camera_identification" : "consented_photo_captured",
      timestamp,
      source: "capture",
      location: eventLocation(session),
      people_involved: session.person_name ? [session.person_name] : ["Rajamma"],
      summary:
        isFrontIdentification
          ? "Lumo received a one-frame front-person identification photo."
          : `One consented photo was saved for ${session.person_name || "this person"}.`,
      risk_score: session.risk_score,
      privacy_level: media.privacy_level,
      retention_policy: media.retention_policy,
      media_url: media.media_url,
      action_items: ["Use only for consented recall context."]
    };

    const nextSession = {
      ...session,
      status: session.status === "ask_transcript_consent" ? session.status : "ask_transcript_consent",
      audit_log: [
        {
          timestamp,
          actor: "system" as const,
          action: "photo_saved",
          note: "Photo metadata saved with consent policy."
        },
        ...session.audit_log
      ].slice(0, 30)
    };

    let latestCaptureCommand = state.latestCaptureCommand;
    if (body.command_id && latestCaptureCommand && latestCaptureCommand.id === body.command_id) {
      latestCaptureCommand = {
        id: latestCaptureCommand.id,
        patient_id: latestCaptureCommand.patient_id,
        command: latestCaptureCommand.command,
        status: "completed",
        requested_at: latestCaptureCommand.requested_at,
        requested_by: latestCaptureCommand.requested_by,
        prompt: latestCaptureCommand.prompt,
        session_id: latestCaptureCommand.session_id,
        result_cue_id: body.result_cue_id
      };
    }

    return {
      state: {
        ...addCaptureMemoryEvent(addMediaToState(updateSessionInState(state, session.id, () => nextSession), media), event),
        latestCaptureCommand
      },
      result: { media, session: nextSession, event }
    };
  });

  if (result.error) return NextResponse.json({ ok: false, stored, ...result }, { status: 200 });

  if (body.skip_watch_cue === true) {
    return NextResponse.json({ ok: true, stored, ...result, watch_cue: null });
  }

  const watchCue = await publishCaptureCue({
    cue: "I received the photo. I am using only the consented memory details.",
    person_name: result.session?.person_name,
    should_vibrate: false
  });
  await mutateCareState((state) => ({ state: { ...state, latestWatchCue: watchCue }, result: null }));

  return NextResponse.json({ ok: true, stored, ...result, watch_cue: watchCue });
}
