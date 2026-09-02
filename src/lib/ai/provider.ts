/**
 * Text JSON AI router.
 * - Local Gemma (Ollama) when OLLAMA_URL or OLLAMA_MODEL is set (unless USE_LOCAL_GEMMA=false).
 * - Otherwise cloud Gemini (unchanged).
 * Multimodal / Live stay on gemini.ts only.
 */
import { generateJson as geminiGenerateJson } from "./gemini";
import { generateJson as gemmaGenerateJson } from "./gemma";
import { hasOllama } from "./ollama";

export function useLocalGemma() {
  if (process.env.USE_LOCAL_GEMMA === "false") return false;
  if (process.env.USE_LOCAL_GEMMA === "true") return true;
  return hasOllama();
}

export async function generateJson<T>(
  prompt: string,
  fallback: T
): Promise<T & { _mock?: boolean; _provider?: string; _model?: string; _error?: string; _elapsed_ms?: number }> {
  if (useLocalGemma()) {
    return gemmaGenerateJson<T>(prompt, fallback);
  }
  return geminiGenerateJson<T>(prompt, fallback);
}
