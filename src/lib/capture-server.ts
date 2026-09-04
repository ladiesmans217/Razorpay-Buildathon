import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";
import { loadCareState, saveCareState, saveLatestWatchCue } from "@/lib/watch-sync-server";
import type {
  CaptureCommand,
  CaptureMedia,
  CaptureSession,
  CaptureSessionStatus,
  CareState,
  MemoryEvent,
  PrivacyLevel,
  RetentionPolicy,
  WatchCue
} from "@/lib/types";

export function latestOpenCaptureSession(state: CareState) {
  return [...(state.captureSessions || [])]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .find((session) => !["saved", "declined", "cancelled"].includes(session.status));
}

export function captureAudit(
  actor: CaptureSession["audit_log"][number]["actor"],
  action: string,
  note: string,
  timestamp = new Date().toISOString()
) {
  return { timestamp, actor, action, note };
}

export function createCaptureSession(input: Partial<CaptureSession> = {}): CaptureSession {
  const now = new Date().toISOString();
  return {
    id: input.id || uid("capture_session"),
    patient_id: input.patient_id || DEMO_PATIENT_ID,
    trigger: input.trigger || "demo",
    status: input.status || "movement_detected",
    started_at: input.started_at || now,
    ended_at: input.ended_at,
    source_device: input.source_device || "android_phone",
    movement_source: input.movement_source || "manual",
    location: input.location,
    speech_snippet: input.speech_snippet,
    speech_classification: input.speech_classification,
    person_name: input.person_name,
    person_description: input.person_description,
    linked_person_id: input.linked_person_id,
    consent: input.consent || { name: false, photo: false, transcript: false },
    privacy_level: input.privacy_level || "caregiver_only",
    retention_policy: input.retention_policy || "24_hours",
    risk_score: input.risk_score ?? 12,
    audit_log: input.audit_log?.length
      ? input.audit_log
      : [captureAudit("system", "session_started", "Consent Memory Capture session started.")]
  };
}

export function updateSessionInState(
  state: CareState,
  sessionId: string,
  update: (session: CaptureSession) => CaptureSession
) {
  return {
    ...state,
    captureSessions: (state.captureSessions || []).map((session) => (session.id === sessionId ? update(session) : session))
  };
}

export function addSessionToState(state: CareState, session: CaptureSession) {
  return {
    ...state,
    captureSessions: [session, ...(state.captureSessions || [])].slice(0, 40)
  };
}

export function addMediaToState(state: CareState, media: CaptureMedia) {
  return {
    ...state,
    captureMedia: [media, ...(state.captureMedia || [])].slice(0, 80)
  };
}

export function addCaptureMemoryEvent(state: CareState, event: MemoryEvent) {
  return {
    ...state,
    memoryEvents: [event, ...state.memoryEvents]
  };
}

export async function mutateCareState<T>(mutator: (state: CareState) => { state: CareState; result: T }) {
  const state = await loadCareState();
  const { state: nextState, result } = mutator(state);
  const stored = await saveCareState(nextState);
  return { stored, state: nextState, result };
}

export async function publishCaptureCue(cue: Omit<WatchCue, "id" | "patient_id" | "created_at" | "source_event" | "speak_mode"> & Partial<WatchCue>) {
  const fullCue: WatchCue = {
    id: cue.id || uid("watch_cue_capture"),
    patient_id: cue.patient_id || DEMO_PATIENT_ID,
    cue: cue.cue,
    source_event: "capture",
    created_at: cue.created_at || new Date().toISOString(),
    person_name: cue.person_name,
    relation: cue.relation,
    should_vibrate: cue.should_vibrate ?? true,
    speak_mode: cue.speak_mode || "native_tts"
  };
  await saveLatestWatchCue(fullCue);
  return fullCue;
}

export async function saveCaptureCommand(command: Partial<CaptureCommand> = {}) {
  const fullCommand: CaptureCommand = {
    id: command.id || uid("capture_command"),
    patient_id: command.patient_id || DEMO_PATIENT_ID,
    command: command.command || "capture_front_person",
    status: command.status || "pending",
    requested_at: command.requested_at || new Date().toISOString(),
    requested_by: command.requested_by || "watch",
    prompt: command.prompt || "Capture one foreground frame for Lumo identification.",
    session_id: command.session_id,
    result_cue_id: command.result_cue_id
  };
  const { stored } = await mutateCareState((state) => ({
    state: {
      ...state,
      latestCaptureCommand: fullCommand
    },
    result: fullCommand
  }));
  return { command: fullCommand, stored };
}

export function eventLocation(session?: CaptureSession) {
  if (!session?.location) return "Memory Capture";
  const label = session.location.human_label || "latest phone location";
  return `${label} (${session.location.latitude.toFixed(5)}, ${session.location.longitude.toFixed(5)})`;
}

export function normalizePrivacy(value: unknown, fallback: PrivacyLevel = "caregiver_only"): PrivacyLevel {
  return value === "private" || value === "caregiver_only" || value === "care_circle" || value === "emergency" ? value : fallback;
}

export function normalizeRetention(value: unknown, fallback: RetentionPolicy = "24_hours"): RetentionPolicy {
  return value === "24_hours" || value === "72_hours" || value === "7_days" || value === "saved" ? value : fallback;
}

export function transitionSession(session: CaptureSession, status: CaptureSessionStatus, note: string, actor: CaptureSession["audit_log"][number]["actor"] = "lumo") {
  return {
    ...session,
    status,
    audit_log: [captureAudit(actor, status, note), ...session.audit_log].slice(0, 30)
  };
}
