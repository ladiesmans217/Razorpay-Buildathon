import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
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
import type { CaptureSession, MemoryEvent } from "@/lib/types";

type SpeechClassification = {
  classification: NonNullable<CaptureSession["speech_classification"]>;
  confidence: number;
  reason: string;
  suggested_prompt: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const snippet = String(body.snippet || body.transcript || "").trim();
  const timestamp = new Date().toISOString();
  const fallback = classifyFallback(snippet);
  const classification = await generateJson<SpeechClassification>(
    `Classify this short rolling speech snippet for a consent-aware dementia memory assistant.
Return JSON with classification, confidence, reason, suggested_prompt.
Allowed classification values: self_talk, shop_transaction, meaningful_social, caregiver_help, unsafe.
Do not store or repeat sensitive private details. Prefer shop_transaction for buying/selling/price talk.
Snippet: ${JSON.stringify(snippet)}`,
    fallback
  );
  const shouldPrompt =
    classification.classification === "meaningful_social" ||
    classification.classification === "caregiver_help" ||
    classification.classification === "unsafe";
  const status = shouldPrompt ? "ask_save_name" : "speech_candidate";
  const prompt =
    classification.suggested_prompt ||
    "I may have heard a conversation. Would you like me to save this person’s name?";
  const cue = shouldPrompt
    ? await publishCaptureCue({
        cue: prompt,
        should_vibrate: true
      })
    : null;

  const { stored, result } = await mutateCareState((state) => {
    const existing = latestOpenCaptureSession(state);
    const base =
      existing ||
      createCaptureSession({
        patient_id: body.patient_id || DEMO_PATIENT_ID,
        trigger: "movement_speech_detected",
        source_device: body.source_device || "android_phone",
        location: body.location,
        started_at: timestamp
      });
    const nextSession = transitionSession(
      {
        ...base,
        status,
        location: body.location || base.location,
        speech_classification: classification.classification,
        speech_snippet: shouldPrompt ? snippet.slice(0, 220) : undefined
      },
      status,
      shouldPrompt ? "Meaningful speech detected; asking patient for consent." : "Speech did not require memory capture.",
      "lumo"
    );

    const event: MemoryEvent = {
      id: uid("event_capture_speech"),
      patient_id: nextSession.patient_id,
      event_type: "ambient_conversation_detected",
      timestamp,
      source: "capture",
      location: eventLocation(nextSession),
      people_involved: ["Rajamma"],
      summary: shouldPrompt
        ? `Memory Guard detected a possible ${classification.classification.replace("_", " ")} conversation and asked for consent.`
        : `Memory Guard ignored a ${classification.classification.replace("_", " ")} snippet. No media saved.`,
      risk_score: classification.classification === "unsafe" ? 66 : shouldPrompt ? 18 : 2,
      privacy_level: shouldPrompt ? "caregiver_only" : "private",
      retention_policy: "24_hours",
      action_items: shouldPrompt ? ["Ask patient whether to save the person's name."] : ["Do not save media without consent."]
    };

    const withSession = existing ? updateSessionInState(state, existing.id, () => nextSession) : addSessionToState(state, nextSession);
    return {
      state: {
        ...addCaptureMemoryEvent(withSession, event),
        ...(cue ? { latestWatchCue: cue } : {})
      },
      result: { session: nextSession, event, classification }
    };
  });

  return NextResponse.json({ ok: true, stored, should_prompt: shouldPrompt, ...result, watch_cue: cue });
}

function classifyFallback(snippet: string): SpeechClassification {
  const text = snippet.toLowerCase();
  if (/\b(lost|help|road|traffic|scared|confused|where am i)\b/.test(text)) {
    return {
      classification: "unsafe",
      confidence: 0.74,
      reason: "Safety-related words were detected.",
      suggested_prompt: "You may need help. Would you like me to notify Ananya and save this moment?"
    };
  }
  if (/\b(price|rupee|rs|buy|sell|shop|vegetable|grocery|bill)\b/.test(text)) {
    return {
      classification: "shop_transaction",
      confidence: 0.72,
      reason: "This sounds like an ordinary transaction.",
      suggested_prompt: ""
    };
  }
  if (/\b(friend|family|son|daughter|remember|yesterday|visited|marriage|trip|school|name|story|home)\b/.test(text)) {
    return {
      classification: "meaningful_social",
      confidence: 0.68,
      reason: "The snippet includes personal or memory-related words.",
      suggested_prompt: "I may have heard a meaningful conversation. Would you like me to save this person’s name?"
    };
  }
  return {
    classification: "self_talk",
    confidence: 0.55,
    reason: "No strong social-memory signal was found.",
    suggested_prompt: ""
  };
}
