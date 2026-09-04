import type { PersonProfile } from "@/lib/types";

export const DEFAULT_FACE_THRESHOLD = 0.5;

export interface FaceMatchResult {
  person: PersonProfile;
  similarity: number;
  distance: number;
  threshold: number;
}

export function averageEmbeddings(embeddings: number[][]) {
  const valid = embeddings.filter((embedding) => embedding.length > 0);
  if (!valid.length) throw new Error("No valid embeddings to average.");
  const length = valid[0].length;
  return Array.from({ length }, (_, index) => {
    const sum = valid.reduce((total, embedding) => total + (embedding[index] || 0), 0);
    return Number((sum / valid.length).toFixed(6));
  });
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aMag += a[index] * a[index];
    bMag += b[index] * b[index];
  }
  if (!aMag || !bMag) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export function euclideanDistance(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const diff = a[index] - b[index];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/** Pure embedding match — safe on server and browser (no Human / DOM). */
export function findTrustedFaceMatchPure(
  embedding: number[],
  people: PersonProfile[],
  threshold = DEFAULT_FACE_THRESHOLD
): FaceMatchResult | null {
  const candidates = people.filter(
    (person) => person.consent_status === "consented" && person.face_embedding?.length
  );
  if (!candidates.length) return null;

  const scored = candidates
    .map((person) => ({
      person,
      similarity: cosineSimilarity(embedding, person.face_embedding || []),
      distance: euclideanDistance(embedding, person.face_embedding || []),
      threshold
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];
  return best && best.similarity >= threshold ? best : null;
}
