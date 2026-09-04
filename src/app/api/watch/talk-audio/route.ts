import { NextResponse } from "next/server";
import { audioPartFromBase64, generateJsonWithParts } from "@/lib/ai/gemini";
import { routeCareMemoryQuestion } from "@/lib/care-memory-router";
import { addSessionToState, createCaptureSession, latestOpenCaptureSession, mutateCareState, saveCaptureCommand } from "@/lib/capture-server";
import { appendWearEvent, loadCareState, readLatestWatchCue } from "@/lib/watch-sync-server";
import type { WatchTalkResponse, WearEvent } from "@/lib/types";

type AudioTranscript = {
  transcript: string;
};

const fallbackReply: WatchTalkResponse & AudioTranscript = {
  transcript: "",
  reply: "I heard your voice, but I could not understand the words. Please say one short sentence close to the watch.",
  intent: "general",
  risk_level: "low",
  action: "answer_only",
  should_end_session: false
};

const TRANSCRIBE_PROMPT = `You are transcribing a short clip from a Galaxy Watch microphone.
The wearer likely said a brief English or Indian-English greeting, question, or care phrase (e.g. hello, who is this, help, I am okay).
Return ONLY valid JSON: {"transcript":"<words>"}.
Rules:
- If you hear any human speech, put the words in transcript (even a single word like hello).
- Prefer the clearest short phrase; do not invent long sentences.
- Only use an empty string if the clip is pure silence or pure noise with no speech.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const audioBase64 = String(body.audio_base64 || "");
  const mimeType = String(body.mime_type || "audio/mp4");
  const audioBytes = Number(body.audio_bytes || 0);
  const patientId = body.patient_id || "patient_rajamma";
  const sessionId = body.session_id || `watch_talk_${Date.now()}`;

  if (!audioBase64) {
    return NextResponse.json({ ok: true, session_id: sessionId, ...fallbackReply, _mock: true });
  }

  const [{ cue }, state] = await Promise.all([readLatestWatchCue(), loadCareState()]);

  // Prefer models that handle audio well; include user's GEMINI_MODEL list first.
  const audioModels = [
    process.env.GEMINI_AUDIO_MODEL,
    process.env.GEMINI_MODEL,
    "gemini-3.5-flash,gemini-2.5-flash,gemini-2.0-flash"
  ]
    .filter(Boolean)
    .join(",");

  const mimeCandidates = uniqueMimes(mimeType);
  let transcription: AudioTranscript & { _mock?: boolean } = { transcript: "", _mock: true };

  for (const mime of mimeCandidates) {
    transcription = await generateJsonWithParts<AudioTranscript>(
      [TRANSCRIBE_PROMPT, audioPartFromBase64(audioBase64, mime)],
      { transcript: "" },
      audioModels
    );
    if (transcription.transcript?.trim()) break;
  }

  const transcript = transcription.transcript?.trim() || "";
  const response = transcript
    ? await routeCareMemoryQuestion({ transcript, state, cue })
    : {
        ...fallbackReply,
        reply: transcription._mock
          ? "I received your audio, but transcription failed on the server. Please try again in a moment."
          : fallbackReply.reply
      };

  await applyTalkAction(response, transcript || `unclear audio (${audioBytes} bytes, ${mimeType})`, patientId, sessionId);
  const publicResponse = withoutRetrievedContext(response);

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    transcript,
    ...publicResponse,
    audio_bytes: audioBytes,
    mime_type: mimeType,
    _mock: Boolean(transcription._mock || ("_mock" in publicResponse && publicResponse._mock))
  });
}

function uniqueMimes(primary: string) {
  const list = [primary, "audio/mp4", "audio/aac", "audio/mpeg", "audio/m4a"].map((m) => m.trim()).filter(Boolean);
  return Array.from(new Set(list));
}

function withoutRetrievedContext<T extends object>(response: T) {
  const publicResponse = { ...response } as T & { retrieved_context?: unknown };
  delete publicResponse.retrieved_context;
  return publicResponse;
}

async function applyTalkAction(response: WatchTalkResponse, transcript: string, patientId: string, sessionId: string) {
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
      id: `wear_audio_camera_request_${Date.now()}`,
      patient_id: patientId,
      type: "talk_turn",
      timestamp: new Date().toISOString(),
      message: `Lumo audio talk requested a foreground camera frame. Command: ${command.command.id}. Patient said: "${transcript}".`
    });
    return;
  }

  if (response.action !== "notify_caregiver" && response.action !== "ok_checkin") {
    await appendWearEvent({
      id: `wear_audio_talk_${Date.now()}`,
      patient_id: patientId,
      type: "talk_turn",
      timestamp: new Date().toISOString(),
      message: `Lumo audio talk: "${transcript}" -> ${response.intent}`
    });
    return;
  }

  const type = response.action === "notify_caregiver" ? "notify_caregiver" : "ok_checkin";
  const event: WearEvent = {
    id: `wear_audio_talk_${Date.now()}`,
    patient_id: patientId,
    type,
    timestamp: new Date().toISOString(),
    message:
      type === "notify_caregiver"
        ? `Lumo audio talk requested caregiver help in session ${sessionId}. Intent: ${response.intent}. Patient said: "${transcript}".`
        : `Lumo audio talk recorded an okay check-in in session ${sessionId}.`
  };
  await appendWearEvent(event);
}
