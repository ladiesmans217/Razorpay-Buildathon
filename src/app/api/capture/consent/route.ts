import { NextResponse } from "next/server";
import {
  addCaptureMemoryEvent,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  publishCaptureCue,
  transitionSession,
  updateSessionInState
} from "@/lib/capture-server";
import { uid } from "@/lib/utils";
import type { CaptureSession, CaptureSessionStatus, MemoryEvent } from "@/lib/types";

type ConsentKind = "name" | "photo" | "transcript" | "cancel";
type ConsentResult = {
  error?: string;
  session: CaptureSession | null;
  event: MemoryEvent | null;
  cueText?: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || body.consent_type || "name") as ConsentKind;
  const accepted = Boolean(body.accepted);
  const timestamp = new Date().toISOString();

  const { stored, result } = await mutateCareState<ConsentResult>((state) => {
    const session = (body.session_id ? state.captureSessions.find((item) => item.id === body.session_id) : latestOpenCaptureSession(state)) || null;
    if (!session) {
      return {
        state,
        result: { error: "No active capture session.", session: null, event: null }
      };
    }

    const next = nextConsentSession(session, kind, accepted, body);
    const cueText = nextCue(kind, accepted, next);
    const event = buildConsentEvent(next, kind, accepted, timestamp);

    return {
      state: addCaptureMemoryEvent(updateSessionInState(state, session.id, () => next), event),
      result: { session: next, event, cueText }
    };
  });

  if (result.error) return NextResponse.json({ ok: false, stored, ...result }, { status: 200 });

  const watchCue = await publishCaptureCue({
    cue: result.cueText || "Consent updated.",
    person_name: result.session?.person_name,
    should_vibrate: true
  });

  await mutateCareState((state) => ({
    state: { ...state, latestWatchCue: watchCue },
    result: null
  }));

  return NextResponse.json({ ok: true, stored, session: result.session, event: result.event, watch_cue: watchCue });
}

function nextConsentSession(session: CaptureSession, kind: ConsentKind, accepted: boolean, body: Record<string, unknown>) {
  if (kind === "cancel" || !accepted) {
    const status: CaptureSessionStatus = kind === "name" || kind === "cancel" ? "declined" : nextStatusAfterDecline(kind);
    return transitionSession(
      {
        ...session,
        status,
        ended_at: status === "declined" ? new Date().toISOString() : session.ended_at,
        consent: {
          ...session.consent,
          ...(kind === "name" ? { name: false } : {}),
          ...(kind === "photo" ? { photo: false } : {}),
          ...(kind === "transcript" ? { transcript: false } : {})
        }
      },
      status,
      `Patient declined ${kind} consent.`,
      "patient"
    );
  }

  if (kind === "name") {
    const personName = String(body.person_name || body.value || "New person").trim();
    return transitionSession(
      {
        ...session,
        status: "ask_photo_consent",
        person_name: personName,
        person_description: String(body.person_description || body.description || "").trim(),
        consent: { ...session.consent, name: true }
      },
      "ask_photo_consent",
      `Patient consented to save name: ${personName}.`,
      "patient"
    );
  }

  if (kind === "photo") {
    return transitionSession(
      {
        ...session,
        status: "ask_transcript_consent",
        consent: { ...session.consent, photo: true }
      },
      "ask_transcript_consent",
      "Patient consented to one photo capture.",
      "patient"
    );
  }

  return transitionSession(
    {
      ...session,
      status: "recording",
      consent: { ...session.consent, transcript: true },
      retention_policy: "saved"
    },
    "recording",
    "Patient consented to transcript recording.",
    "patient"
  );
}

function nextStatusAfterDecline(kind: ConsentKind): CaptureSessionStatus {
  if (kind === "photo") return "ask_transcript_consent";
  if (kind === "transcript") return "summarizing";
  return "declined";
}

function nextCue(kind: ConsentKind, accepted: boolean, session: CaptureSession) {
  if (!accepted && (kind === "name" || kind === "cancel")) return "Okay. I will not save this conversation.";
  if (kind === "name" && accepted) {
    return `Thank you. I saved the name ${session.person_name}. May I capture one photo with permission?`;
  }
  if (kind === "photo" && accepted) return "Okay. The phone can capture one photo now. Would you also like me to save the conversation transcript?";
  if (kind === "photo") return "Okay, no photo will be saved. Would you like me to save only the conversation transcript?";
  if (kind === "transcript" && accepted) return "Okay. I will save the conversation transcript now. Say conversation ended when I should stop.";
  return "Okay. I will not save the transcript. I can still keep the consented name.";
}

function buildConsentEvent(session: CaptureSession, kind: ConsentKind, accepted: boolean, timestamp: string): MemoryEvent {
  return {
    id: uid("event_capture_consent"),
    patient_id: session.patient_id,
    event_type: kind === "name" ? "consented_person_named" : kind === "photo" ? "consented_photo_captured" : "consented_transcript_saved",
    timestamp,
    source: "capture",
    location: eventLocation(session),
    people_involved: session.person_name ? [session.person_name] : ["Rajamma"],
    summary: accepted ? `Patient consented to ${kind} capture.` : `Patient declined ${kind} capture.`,
    risk_score: session.risk_score,
    privacy_level: session.privacy_level,
    retention_policy: session.retention_policy,
    action_items: ["Respect patient consent and do not save extra raw media."]
  };
}
