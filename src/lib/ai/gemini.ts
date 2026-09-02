import { createPartFromBase64, GoogleGenAI, type Part } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const models = (process.env.GEMINI_MODEL || "gemini-3.1-flash-lite,gemini-2.5-flash-lite")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);

export function hasGeminiKey() {
  return Boolean(apiKey);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || trimmed;
}

export async function generateJson<T>(prompt: string, fallback: T): Promise<T & { _mock?: boolean }> {
  if (!apiKey) return { ...(fallback as object), _mock: true } as T & { _mock?: boolean };

  const ai = new GoogleGenAI({ apiKey });
  for (const model of models) {
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.3
          }
        }),
        GEMINI_TIMEOUT_MS
      );
      const parsed = JSON.parse(extractJson(result.text || ""));
      return parsed as T & { _mock?: boolean };
    } catch (error) {
      console.error(`Gemini model ${model} failed; trying fallback if available`, error);
    }
  }
  return { ...(fallback as object), _mock: true } as T & { _mock?: boolean };
}

export async function generateJsonWithParts<T>(
  parts: Array<Part | string>,
  fallback: T,
  preferredModels = process.env.GEMINI_AUDIO_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash,gemini-2.5-flash,gemini-2.0-flash"
): Promise<T & { _mock?: boolean }> {
  if (!apiKey) return { ...(fallback as object), _mock: true } as T & { _mock?: boolean };

  const ai = new GoogleGenAI({ apiKey });
  const audioModels = preferredModels
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  // Longer timeout for base64 watch clips over tunnel.
  const audioTimeoutMs = Math.max(GEMINI_TIMEOUT_MS, 25000);

  for (const model of audioModels) {
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model,
          contents: parts,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        }),
        audioTimeoutMs
      );
      const text = result.text || "";
      const parsed = JSON.parse(extractJson(text));
      return parsed as T & { _mock?: boolean };
    } catch (error) {
      console.error(`Gemini audio model ${model} failed; trying fallback if available`, error);
    }
  }

  return { ...(fallback as object), _mock: true } as T & { _mock?: boolean };
}

export function audioPartFromBase64(data: string, mimeType: string) {
  return createPartFromBase64(data, mimeType);
}

export async function generateGroundedJson<T>(prompt: string, fallback: T): Promise<T & { _mock?: boolean; citations?: string[] }> {
  if (!apiKey || process.env.ENABLE_GEMINI_GROUNDING !== "true") {
    return { ...(fallback as object), _mock: true } as T & { _mock?: boolean; citations?: string[] };
  }

  const ai = new GoogleGenAI({ apiKey });
  const groundedModels = (process.env.GEMINI_GROUNDED_MODEL || process.env.GEMINI_MODEL || "gemini-3.1-flash-lite,gemini-2.5-flash")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const model of groundedModels) {
    try {
      const result = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} } as never],
            temperature: 0.2
          }
        }),
        GEMINI_TIMEOUT_MS
      );
      const parsed = JSON.parse(extractJson(result.text || ""));
      return {
        ...(parsed as object),
        citations: extractGroundingUrls(result)
      } as T & { _mock?: boolean; citations?: string[] };
    } catch (error) {
      console.error(`Gemini grounded model ${model} failed; trying fallback if available`, error);
    }
  }

  return { ...(fallback as object), _mock: true } as T & { _mock?: boolean; citations?: string[] };
}

function extractGroundingUrls(result: unknown) {
  const candidates = (result as { candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> })
    .candidates;
  return Array.from(
    new Set(
      candidates
        ?.flatMap((candidate) => candidate.groundingMetadata?.groundingChunks || [])
        .map((chunk) => chunk.web?.uri)
        .filter((uri): uri is string => Boolean(uri)) || []
    )
  ).slice(0, 5);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}
