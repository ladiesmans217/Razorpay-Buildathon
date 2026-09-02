const OLLAMA_URL = (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "30m";

export type AiProviderMetadata = {
  _mock?: boolean;
  _provider?: "ollama" | "mock";
  _model?: string;
  _error?: string;
  _elapsed_ms?: number;
};

type OllamaGenerateResponse = {
  model?: string;
  response?: string;
  message?: { content?: string };
  done?: boolean;
  total_duration?: number;
  load_duration?: number;
  eval_count?: number;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaPsResponse = {
  models?: Array<{ name?: string; model?: string; expires_at?: string }>;
};

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || trimmed;
}

/** True only when OLLAMA_URL or OLLAMA_MODEL is set in env (defaults alone do not enable local). */
export function hasOllama() {
  return Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL);
}

export function getOllamaConfig() {
  return {
    url: OLLAMA_URL,
    model: OLLAMA_MODEL,
    timeout_ms: OLLAMA_TIMEOUT_MS,
    keep_alive: OLLAMA_KEEP_ALIVE
  };
}

export async function preloadOllama(timeoutMs = 20000) {
  if (!hasOllama()) return false;
  const res = await fetchWithTimeout(
    `${OLLAMA_URL}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE
      })
    },
    timeoutMs
  );
  return res.ok;
}

export async function getOllamaHealth(options: { preload?: boolean } = {}) {
  const started = Date.now();
  const base = {
    provider: "ollama" as const,
    configured: hasOllama(),
    url: OLLAMA_URL,
    model: OLLAMA_MODEL,
    keep_alive: OLLAMA_KEEP_ALIVE,
    reachable: false,
    installed: false,
    loaded: false,
    response_ms: 0,
    tags: [] as string[],
    expires_at: undefined as string | undefined,
    error: undefined as string | undefined
  };

  if (!base.configured) return { ...base, response_ms: Date.now() - started };

  try {
    const tags = await fetchJson<OllamaTagsResponse>(`${OLLAMA_URL}/api/tags`, 10000);
    const tagNames = (tags.models || []).map((model) => model.model || model.name || "").filter(Boolean);
    let ps = await fetchJson<OllamaPsResponse>(`${OLLAMA_URL}/api/ps`, 10000);
    let loaded = findModel(ps.models, OLLAMA_MODEL);

    if (options.preload && !loaded) {
      await preloadOllama();
      ps = await fetchJson<OllamaPsResponse>(`${OLLAMA_URL}/api/ps`, 10000);
      loaded = findModel(ps.models, OLLAMA_MODEL);
    }

    return {
      ...base,
      reachable: true,
      installed: Boolean(findModel(tags.models, OLLAMA_MODEL)),
      loaded: Boolean(loaded),
      response_ms: Date.now() - started,
      tags: tagNames,
      expires_at: loaded?.expires_at
    };
  } catch (error) {
    return {
      ...base,
      response_ms: Date.now() - started,
      error: errorMessage(error)
    };
  }
}

export async function generateJson<T>(prompt: string, fallback: T): Promise<T & AiProviderMetadata> {
  const started = Date.now();

  try {
    const res = await fetchWithTimeout(
      `${OLLAMA_URL}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt,
          stream: false,
          format: "json",
          keep_alive: OLLAMA_KEEP_ALIVE,
          options: { temperature: 0.2, num_predict: 512 }
        })
      },
      OLLAMA_TIMEOUT_MS
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ollama HTTP ${res.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }

    const data = (await res.json()) as OllamaGenerateResponse;
    const text = data.response || data.message?.content || "";
    if (!text.trim()) throw new Error("Ollama returned an empty JSON response");

    const parsed = JSON.parse(extractJson(text));
    return withMetadata(parsed as T, {
      _provider: "ollama",
      _model: data.model || OLLAMA_MODEL,
      _elapsed_ms: Date.now() - started
    });
  } catch (error) {
    console.error("Ollama generateJson failed:", error);
    return withMetadata(fallback, {
      _mock: true,
      _provider: "ollama",
      _model: OLLAMA_MODEL,
      _error: errorMessage(error),
      _elapsed_ms: Date.now() - started
    });
  }
}

async function fetchJson<T>(url: string, timeoutMs: number) {
  const res = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function findModel<T extends { name?: string; model?: string }>(models: T[] | undefined, wanted: string) {
  return models?.find(
    (model) => model.model === wanted || model.name === wanted || model.name?.split(":")[0] === wanted
  );
}

function withMetadata<T>(value: T, metadata: AiProviderMetadata): T & AiProviderMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as object), ...metadata } as T & AiProviderMetadata;
  }
  return { value, ...metadata } as unknown as T & AiProviderMetadata;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

if (hasOllama()) {
  preloadOllama(15000).catch(() => {
    // Startup warmup is best-effort; request paths expose health details.
  });
}
