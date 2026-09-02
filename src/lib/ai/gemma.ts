import {
  getOllamaConfig,
  generateJson as ollamaGenerateJson,
  hasOllama,
  type AiProviderMetadata
} from "./ollama";

export function hasGemma() {
  return hasOllama();
}

export function getGemmaConfig() {
  return getOllamaConfig();
}

export async function generateJson<T>(prompt: string, fallback: T): Promise<T & AiProviderMetadata> {
  if (hasOllama()) return ollamaGenerateJson<T>(prompt, fallback);

  return {
    ...(fallback as object),
    _mock: true,
    _provider: "mock",
    _error: "Local Gemma/Ollama is not configured. Set OLLAMA_URL and OLLAMA_MODEL."
  } as T & AiProviderMetadata;
}

export async function generateUnavailableLocalResponse<T>(
  fallback: T,
  message = "This feature needs local Gemma/Ollama to be running."
): Promise<T & AiProviderMetadata> {
  return {
    ...(fallback as object),
    _mock: true,
    _provider: hasOllama() ? "ollama" : "mock",
    _model: hasOllama() ? getOllamaConfig().model : undefined,
    _error: message
  } as T & AiProviderMetadata;
}
