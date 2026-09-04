import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import {
  addCaptureMemoryEvent,
  eventLocation,
  latestOpenCaptureSession,
  mutateCareState,
  publishCaptureCue,
  transitionSession,
  updateSessionInState
} from "@/lib/capture-server";
import { loadCareState } from "@/lib/watch-sync-server";
import { uid } from "@/lib/utils";
import type { CaptureMedia, CaptureSession, MemoryEvent, PersonProfile } from "@/lib/types";

type CaptureSummary = {
  summary: string;
  memory_note: string;
  future_prompt: string;
  emotion: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const timestamp = new Date().toISOString();

  const currentState = await loadCareState();
  const session = (body.session_id ? currentState.captureSessions.find((item) => item.id === body.session_id) : latestOpenCaptureSession(currentState)) || null;
  if (!session) return NextResponse.json({ ok: false, error: "No active capture session.", session: null, event: null, person: null }, { status: 200 });

  const sessionId = session.id;
  const sessionMedia = (currentState.captureMedia || []).filter((media) => media.session_id === session.id);
  const transcript = String(body.transcript || latestTranscript(sessionMedia) || session.speech_snippet || "").trim();

  const summary = await generateJson<CaptureSummary>(
    `Summarize a consented dementia memory capture. Do not diagnose. Keep it respectful and short.
Return JSON with summary, memory_note, future_prompt, emotion.
Person name: ${JSON.stringify(session.person_name || "Unknown")}
Person description: ${JSON.stringify(session.person_description || "")}
Transcript: ${JSON.stringify(transcript || "")}`,
    fallbackSummary(session.person_name, transcript)
  );

  const second = await mutateCareState<{ session: CaptureSession | null; event: MemoryEvent | null; person: PersonProfile | null }>((state) => {
    const savedSession = state.captureSessions.find((item) => item.id === sessionId);
    if (!savedSession) return { state, result: { session: null, event: null, person: null } };
    const existingPerson = savedSession.person_name
      ? state.people.find((person) => person.name.toLowerCase() === savedSession.person_name?.toLowerCase())
      : undefined;
    const photo = latestPhoto(state.captureMedia.filter((media) => media.session_id === savedSession.id));
    const person = savedSession.person_name
      ? upsertCapturedPerson(existingPerson, savedSession, summary, timestamp, photo)
      : null;
    const people = person
      ? existingPerson
        ? state.people.map((item) => (item.id === existingPerson.id ? person : item))
        : [person, ...state.people]
      : state.people;
    const nextSession = transitionSession(
      {
        ...savedSession,
        status: "saved",
        ended_at: timestamp,
        linked_person_id: person?.id || savedSession.linked_person_id,
        retention_policy: "saved"
      },
      "saved",
      "Consent Memory Capture summarized and saved.",
      "system"
    );
    const event: MemoryEvent = {
      id: uid("event_capture_complete"),
      patient_id: savedSession.patient_id,
      event_type: "conversation",
      timestamp,
      source: "capture",
      location: eventLocation(savedSession),
      people_involved: person ? [person.name] : ["Rajamma"],
      summary: summary.summary,
      raw_transcript: transcript,
      risk_score: savedSession.risk_score,
      privacy_level: "caregiver_only",
      retention_policy: "saved",
      media_url: photo?.media_url,
      action_items: [summary.future_prompt]
    };
    return {
      state: addCaptureMemoryEvent(
        {
          ...updateSessionInState(state, savedSession.id, () => nextSession),
          people
        },
        event
      ),
      result: { session: nextSession, event, person }
    };
  });

  const watchCue = await publishCaptureCue({
    cue: session.person_name
      ? `Saved. ${session.person_name} is now in your care memory. I can remind you about this later.`
      : "Saved. I made a short care memory from this conversation.",
    person_name: session.person_name,
    should_vibrate: true
  });
  await mutateCareState((state) => ({ state: { ...state, latestWatchCue: watchCue }, result: null }));

  return NextResponse.json({ ok: true, stored: second.stored, summary, ...second.result, watch_cue: watchCue });
}

function latestTranscript(media: CaptureMedia[]) {
  return [...media]
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
    .find((item) => item.kind === "transcript")?.transcript_text;
}

function latestPhoto(media: CaptureMedia[]) {
  return [...media]
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())
    .find((item) => item.kind === "photo");
}

function fallbackSummary(personName = "this person", transcript = ""): CaptureSummary {
  return {
    summary: transcript
      ? `${personName} had a consented conversation with Rajamma. ${transcript.slice(0, 120)}`
      : `${personName} was saved as a consented memory contact for Rajamma.`,
    memory_note: `${personName} was added through Consent Memory Capture.`,
    future_prompt: `Ask about ${personName} and the conversation saved today.`,
    emotion: "calm"
  };
}

function upsertCapturedPerson(
  existing: PersonProfile | undefined,
  session: NonNullable<Awaited<ReturnType<typeof latestOpenCaptureSession>>>,
  summary: CaptureSummary,
  timestamp: string,
  photo?: CaptureMedia
): PersonProfile {
  const name = session.person_name || existing?.name || "New person";
  return {
    id: existing?.id || uid("person_capture"),
    patient_id: session.patient_id,
    name,
    relation: session.person_description || existing?.relation || "remembered person",
    role: existing?.role || "volunteer",
    trust_level: existing?.trust_level || "community",
    profile_photo_url: photo?.media_url || existing?.profile_photo_url || "/samples/rwa.svg",
    face_embedding: existing?.face_embedding,
    face_embedding_model: existing?.face_embedding_model,
    face_samples: existing?.face_samples,
    face_embedding_updated_at: existing?.face_embedding_updated_at,
    memory_note: summary.memory_note || existing?.memory_note || `${name} was added through Consent Memory Capture.`,
    allowed_visibility: "caregiver_only",
    last_seen_at: timestamp,
    last_seen_location: session.location?.human_label || "Memory Capture",
    last_conversation_summary: summary.summary,
    consent_status: "consented"
  };
}
