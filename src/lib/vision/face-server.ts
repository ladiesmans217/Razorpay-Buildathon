import { createPartFromBase64 } from "@google/genai";
import { generateJsonWithParts, hasGeminiKey } from "@/lib/ai/gemini";
import type { PersonProfile } from "@/lib/types";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { loadCareState } from "@/lib/watch-sync-server";
import {
  DEFAULT_FACE_THRESHOLD,
  findTrustedFaceMatchPure,
  type FaceMatchResult
} from "./face-match-math";

export type ServerFaceStatus = "matched" | "unknown" | "no_face";

export interface ServerFaceRecognition {
  ok: true;
  status: ServerFaceStatus;
  person: PersonProfile | null;
  similarity: number | null;
  threshold: number;
  label: string;
  detail: string;
  cue: string;
  method: "embedding" | "gemini_vision" | "fallback";
  mock?: boolean;
  roster_count?: number;
  roster_with_embeddings?: number;
}

function consentedPeople(people: PersonProfile[], patientId: string) {
  return people.filter(
    (person) => person.patient_id === patientId && person.consent_status === "consented"
  );
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1] || "image/jpeg", base64: match[2] };
}

function buildCue(person: PersonProfile) {
  return `This is ${person.name}. ${person.relation}. ${person.last_conversation_summary}`;
}

function withRosterMeta(
  result: ServerFaceRecognition,
  people: PersonProfile[]
): ServerFaceRecognition {
  return {
    ...result,
    roster_count: people.length,
    roster_with_embeddings: people.filter((person) => person.face_embedding?.length).length
  };
}

function matchedResult(match: FaceMatchResult, method: ServerFaceRecognition["method"]): ServerFaceRecognition {
  return {
    ok: true,
    status: "matched",
    person: match.person,
    similarity: match.similarity,
    threshold: match.threshold,
    label: match.person.name,
    detail: `${match.person.relation}. ${match.person.last_conversation_summary}`,
    cue: buildCue(match.person),
    method
  };
}

function unknownResult(threshold: number, method: ServerFaceRecognition["method"], mock?: boolean): ServerFaceRecognition {
  return {
    ok: true,
    status: "unknown",
    person: null,
    similarity: null,
    threshold,
    label: "Unknown person",
    detail: "No enrolled trusted profile matched. Unknown faces are not identified.",
    cue: "I do not recognize this person as an enrolled trusted contact. Please stay calm and ask Ananya if you feel unsure.",
    method,
    mock
  };
}

function noFaceResult(threshold: number, method: ServerFaceRecognition["method"], mock?: boolean): ServerFaceRecognition {
  return {
    ok: true,
    status: "no_face",
    person: null,
    similarity: null,
    threshold,
    label: "No clear face",
    detail: "Could not clearly see a face. Try a brighter, front-facing photo.",
    cue: "I could not clearly see a face. Please point the CareGrid phone camera again or use Capture photo now.",
    method,
    mock
  };
}

/**
 * Laptop-side recognition for phone Guard.
 * Prefer pure embedding match when client/enroll sent vectors;
 * otherwise Gemini vision against consented profiles (no on-phone Human models).
 */
export async function recognizeFaceOnServer(input: {
  dataUrl?: string;
  embedding?: number[];
  patientId?: string;
  threshold?: number;
}): Promise<ServerFaceRecognition> {
  const patientId = input.patientId || DEMO_PATIENT_ID;
  const threshold = input.threshold ?? DEFAULT_FACE_THRESHOLD;
  const state = await loadCareState();
  const people = consentedPeople(state.people || [], patientId);
  const wrap = (result: ServerFaceRecognition) => withRosterMeta(result, people);

  // Primary path: same Human face.description vectors as Enroll.
  if (Array.isArray(input.embedding) && input.embedding.length > 0) {
    const withEmb = people.filter((person) => person.face_embedding?.length);
    if (!withEmb.length) {
      return wrap({
        ...unknownResult(threshold, "embedding"),
        detail: "No consented people with face embeddings are stored on the server yet. Re-open Enroll and save again while Firebase is live."
      });
    }
    const match = findTrustedFaceMatchPure(input.embedding, people, threshold);
    if (match) return wrap(matchedResult(match, "embedding"));
    return wrap(unknownResult(threshold, "embedding"));
  }

  const dataUrl = input.dataUrl?.trim();
  if (!dataUrl) {
    return wrap(noFaceResult(threshold, "fallback", true));
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return wrap(noFaceResult(threshold, "fallback", true));
  }

  if (!hasGeminiKey()) {
    return wrap(unknownResult(threshold, "fallback", true));
  }

  const roster = people.map((person) => ({
    id: person.id,
    name: person.name,
    relation: person.relation,
    role: person.role,
    summary: person.last_conversation_summary || "",
    has_embedding: Boolean(person.face_embedding?.length)
  }));

  // Optional secondary: Gemini with capture frame only (no Human vectors). Prefer embedding path from Guard.
  const vision = await generateJsonWithParts<{
    status?: ServerFaceStatus;
    person_id?: string | null;
    person_name?: string | null;
    confidence?: number;
    reason?: string;
  }>(
    [
      createPartFromBase64(parsed.base64, parsed.mimeType),
      `You are CareGrid face privacy matcher for a dementia patient.
Only identify people from the consented roster. Never invent strangers' names.
If the photo has no clear face, status=no_face.
If a face is present but not clearly one of the roster, status=unknown.
If clearly one roster person, status=matched and return their exact id and name.

Consented roster JSON:
${JSON.stringify(roster)}

Return JSON only:
{"status":"matched"|"unknown"|"no_face","person_id":string|null,"person_name":string|null,"confidence":0-1,"reason":string}`
    ],
    {
      status: "unknown",
      person_id: null,
      person_name: null,
      confidence: 0,
      reason: "fallback"
    },
    process.env.GEMINI_VISION_MODEL ||
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash,gemini-2.0-flash,gemini-3.1-flash-lite"
  );

  const status = vision.status || "unknown";
  if (status === "no_face") {
    return wrap({ ...noFaceResult(threshold, "gemini_vision", vision._mock), mock: vision._mock });
  }

  if (status === "matched") {
    const person =
      people.find((item) => item.id === vision.person_id) ||
      people.find((item) => item.name.toLowerCase() === String(vision.person_name || "").toLowerCase());
    if (person) {
      const similarity = typeof vision.confidence === "number" ? vision.confidence : 0.8;
      if (similarity >= Math.min(threshold, 0.45)) {
        return wrap(
          matchedResult({ person, similarity, distance: 1 - similarity, threshold }, "gemini_vision")
        );
      }
    }
  }

  return wrap({ ...unknownResult(threshold, "gemini_vision", vision._mock), mock: vision._mock });
}
