import { NextResponse } from "next/server";
import {
  addCaptureMemoryEvent,
  addSessionToState,
  captureAudit,
  createCaptureSession,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  saveCaptureCommand,
  transitionSession,
  updateSessionInState
} from "@/lib/capture-server";
import { routeCareMemoryQuestion } from "@/lib/care-memory-router";
import { appendWearEvent, loadCareState, readLatestWatchCue } from "@/lib/watch-sync-server";
import { uid } from "@/lib/utils";
import type { MemoryEvent, WatchTalkResponse, WearEvent } from "@/lib/types";

const fallbackReply: WatchTalkResponse = {
  reply: "I did not hear that clearly. Please say it once more, slowly.",
  intent: "general",
  risk_level: "low",
  action: "answer_only",
  should_end_session: false
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const transcript = String(body.transcript || "").trim();
  const patientId = body.patient_id || "patient_rajamma";
  const sessionId = body.session_id || `watch_talk_${Date.now()}`;

  if (!transcript) {
    return NextResponse.json({ ok: true, session_id: sessionId, transcript, ...fallbackReply });
  }

  const [{ cue }, state] = await Promise.all([readLatestWatchCue(), loadCareState()]);
  const response = await routeCareMemoryQuestion({ transcript, state, cue });
  await applyTalkAction(response, transcript, patientId, sessionId);
  const publicResponse = withoutRetrievedContext(response);

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    transcript,
    ...publicResponse
  });
}

function withoutRetrievedContext<T extends object>(response: T) {
  const publicResponse = { ...response } as T & { retrieved_context?: unknown };
  delete publicResponse.retrieved_context;
  return publicResponse;
}

async function applyTalkAction(response: WatchTalkResponse, transcript: string, patientId: string, sessionId: string) {
  if (response.capture_update) {
    await applyCaptureVoiceUpdate(response, transcript, patientId);
  }

  if (response.action === "request_camera_frame") {
    const { result: captureSession } = await mutateCareState((state) => {
      const activeCapture = latestOpenCaptureSession(state);
      if (activeCapture?.trigger === "manual_who_is_this") return { state, result: activeCapture };
      const session = createCaptureSession({
        patient_id: patientId,
        trigger: "manual_who_is_this",
        status: "speech_candidate",
        source_device: "android_phone",
        movement_source: "manual",
        consent: { name: false, photo: true, transcript: false },
        privacy_level: "caregiver_only",
        retention_policy: "24_hours",
        risk_score: 8
      });
      return { state: addSessionToState(state, session), result: session };
    });
    const command = await saveCaptureCommand({
      patient_id: patientId,
      requested_by: "watch",
      prompt: "Lumo requested one front-person frame from the phone camera.",
      session_id: captureSession.id
    });
    await appendWearEvent({
      id: `wear_camera_request_${Date.now()}`,
      patient_id: patientId,
      type: "talk_turn",
      timestamp: new Date().toISOString(),
      message: `Lumo requested a foreground camera frame. Command: ${command.command.id}. Patient said: "${transcript}".`
    });
    return;
  }

  if (response.action !== "notify_caregiver" && response.action !== "ok_checkin") {
    await appendWearEvent({
      id: `wear_talk_${Date.now()}`,
      patient_id: patientId,
      type: "talk_turn",
      timestamp: new Date().toISOString(),
      message: `Lumo talk: "${transcript}" -> ${response.intent}`
    });
    return;
  }

  const type = response.action === "notify_caregiver" ? "notify_caregiver" : "ok_checkin";
  const event: WearEvent = {
    id: `wear_talk_${Date.now()}`,
    patient_id: patientId,
    type,
    timestamp: new Date().toISOString(),
    message:
      type === "notify_caregiver"
        ? `Lumo talk requested caregiver help in session ${sessionId}. Intent: ${response.intent}. Patient said: "${transcript}".`
        : `Lumo talk recorded an okay check-in in session ${sessionId}.`
  };
  await appendWearEvent(event);
}

async function applyCaptureVoiceUpdate(response: WatchTalkResponse, transcript: string, patientId: string) {
  const update = response.capture_update;
  if (!update) return;

  await mutateCareState((state) => {
    const session = latestOpenCaptureSession(state);
    if (!session) return { state, result: null };
    const timestamp = new Date().toISOString();
    let nextSession = session;

    if (update.kind === "cancel" || (update.kind === "name" && !update.accepted)) {
      nextSession = transitionSession(
        {
          ...session,
          status: "declined",
          ended_at: timestamp,
          consent: { ...session.consent, name: false }
        },
        "declined",
        "Patient declined consent from watch talk.",
        "patient"
      );
    } else if (update.kind === "name" && update.accepted) {
      nextSession = transitionSession(
        {
          ...session,
          status: "ask_photo_consent",
          person_name: update.person_name || session.person_name,
          person_description: update.person_description || session.person_description,
          consent: { ...session.consent, name: true }
        },
        "ask_photo_consent",
        `Patient named ${update.person_name || "a person"} by voice.`,
        "patient"
      );
    } else if (update.kind === "photo") {
      nextSession = transitionSession(
        {
          ...session,
          status: "ask_transcript_consent",
          consent: { ...session.consent, photo: update.accepted }
        },
        "ask_transcript_consent",
        update.accepted ? "Patient allowed one photo by voice." : "Patient declined photo by voice.",
        "patient"
      );
    } else if (update.kind === "transcript") {
      nextSession = transitionSession(
        {
          ...session,
          status: update.accepted ? "recording" : "summarizing",
          consent: { ...session.consent, transcript: update.accepted },
          retention_policy: update.accepted ? "saved" : session.retention_policy
        },
        update.accepted ? "recording" : "summarizing",
        update.accepted ? "Patient allowed transcript by voice." : "Patient declined transcript by voice.",
        "patient"
      );
    } else if (update.kind === "complete") {
      nextSession = transitionSession(
        {
          ...session,
          status: "summarizing",
          ended_at: timestamp,
          audit_log: [captureAudit("patient", "conversation_ended", transcript), ...session.audit_log].slice(0, 30)
        },
        "summarizing",
        "Patient ended the consented conversation from watch talk.",
        "patient"
      );
    }

    const event: MemoryEvent = {
      id: uid("event_capture_voice"),
      patient_id: patientId,
      event_type:
        update.kind === "name"
          ? "consented_person_named"
          : update.kind === "photo"
            ? "consented_photo_captured"
            : update.kind === "complete"
              ? "consented_transcript_saved"
              : "ambient_conversation_detected",
      timestamp,
      source: "capture",
      location: eventLocation(nextSession),
      people_involved: nextSession.person_name ? [nextSession.person_name] : ["Rajamma"],
      summary: `Capture consent update from watch: ${update.kind} ${update.accepted ? "accepted" : "declined"}.`,
      raw_transcript: transcript,
      risk_score: nextSession.risk_score,
      privacy_level: nextSession.privacy_level,
      retention_policy: nextSession.retention_policy,
      action_items: ["Continue consent-aware memory capture."]
    };

    return {
      state: addCaptureMemoryEvent(updateSessionInState(state, session.id, () => nextSession), event),
      result: nextSession
    };
  });
}
