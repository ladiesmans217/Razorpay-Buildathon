"use client";

import { GoogleGenAI, Modality } from "@google/genai";
import { liveToolsForSession } from "@/lib/ai/live-tools";
import { MicStreamer, PcmPlayer } from "@/lib/live/audio";
import { CameraFrameStreamer } from "@/lib/live/video";

export type LiveSessionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "error"
  | "closed";

export interface LiveSessionCallbacks {
  onStatus?: (status: LiveSessionStatus) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onError?: (message: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>, id: string) => Promise<Record<string, unknown>>;
}

export interface LiveSessionHandle {
  sendText: (text: string) => void;
  setMicMuted: (muted: boolean) => void;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  interruptPlayback: () => void;
  close: () => void;
}

interface TokenResponse {
  ok: boolean;
  token?: string;
  model?: string;
  error?: string;
  affectiveEnabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveSessionAny = any;

export async function startLumoLiveSession(
  callbacks: LiveSessionCallbacks = {}
): Promise<LiveSessionHandle> {
  callbacks.onStatus?.("connecting");

  const tokenRes = await fetch("/api/live/token", { method: "POST" });
  const tokenJson = (await tokenRes.json()) as TokenResponse;
  if (!tokenRes.ok || !tokenJson.token) {
    const message = tokenJson.error || "Could not create Live token. Set GEMINI_API_KEY.";
    callbacks.onStatus?.("error");
    callbacks.onError?.(message);
    throw new Error(message);
  }

  const model = tokenJson.model || "gemini-3.1-flash-live-preview";
  const ai = new GoogleGenAI({
    apiKey: tokenJson.token,
    httpOptions: { apiVersion: "v1alpha" }
  });

  const player = new PcmPlayer();
  const mic = new MicStreamer();
  let camera: CameraFrameStreamer | null = null;
  let session: LiveSessionAny | null = null;
  let closed = false;

  const config: Record<string, unknown> = {
    responseModalities: [Modality.AUDIO],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
    },
    tools: liveToolsForSession(),
    sessionResumption: {}
  };

  // Affective dialog only on 2.5 Live family (not 3.1).
  if (tokenJson.affectiveEnabled && model.includes("2.5")) {
    config.enableAffectiveDialog = true;
  }

  if (model.includes("3.1")) {
    config.thinkingConfig = { thinkingLevel: "minimal" };
  }

  session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onopen: () => {
        callbacks.onStatus?.("listening");
      },
      onmessage: async (message: LiveSessionAny) => {
        try {
          const sc = message.serverContent;
          if (sc?.interrupted) {
            player.interrupt();
            callbacks.onStatus?.("listening");
          }
          if (sc?.inputTranscription?.text) {
            callbacks.onInputTranscript?.(sc.inputTranscription.text);
          }
          if (sc?.outputTranscription?.text) {
            callbacks.onOutputTranscript?.(sc.outputTranscription.text);
          }
          if (sc?.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.inlineData?.data) {
                callbacks.onStatus?.("speaking");
                await player.playBase64Pcm(part.inlineData.data, 24000);
              }
            }
          }
          if (sc?.turnComplete) {
            callbacks.onStatus?.("listening");
          }

          if (message.toolCall?.functionCalls?.length) {
            const functionResponses = [];
            for (const fc of message.toolCall.functionCalls) {
              const args =
                typeof fc.args === "object" && fc.args
                  ? (fc.args as Record<string, unknown>)
                  : {};
              let result: Record<string, unknown> = { ok: false, error: "No tool handler" };
              if (callbacks.onToolCall) {
                try {
                  result = await callbacks.onToolCall(fc.name, args, fc.id);
                } catch (error) {
                  result = {
                    ok: false,
                    error: error instanceof Error ? error.message : "Tool failed"
                  };
                }
              }
              functionResponses.push({
                id: fc.id,
                name: fc.name,
                response: result
              });
            }
            session?.sendToolResponse?.({ functionResponses });
          }
        } catch (error) {
          callbacks.onError?.(error instanceof Error ? error.message : "Live message error");
        }
      },
      onerror: (e: ErrorEvent) => {
        callbacks.onError?.(e.message || "Live connection error");
        callbacks.onStatus?.("error");
      },
      onclose: () => {
        if (!closed) callbacks.onStatus?.("closed");
      }
    }
  });

  await mic.start((base64) => {
    try {
      session?.sendRealtimeInput?.({
        audio: { data: base64, mimeType: "audio/pcm;rate=16000" }
      });
    } catch {
      /* ignore send after close */
    }
  });

  const handle: LiveSessionHandle = {
    sendText(text: string) {
      session?.sendRealtimeInput?.({ text });
    },
    setMicMuted(muted: boolean) {
      mic.setMuted(muted);
    },
    async setCameraEnabled(enabled: boolean) {
      if (!enabled) {
        camera?.stop();
        camera = null;
        return;
      }
      if (camera) return;
      camera = new CameraFrameStreamer();
      await camera.start((base64Jpeg) => {
        try {
          session?.sendRealtimeInput?.({
            video: { data: base64Jpeg, mimeType: "image/jpeg" }
          });
        } catch {
          /* ignore */
        }
      }, 1);
    },
    interruptPlayback() {
      player.interrupt();
    },
    close() {
      closed = true;
      mic.stop();
      camera?.stop();
      player.dispose();
      try {
        session?.close?.();
      } catch {
        /* ignore */
      }
      session = null;
      callbacks.onStatus?.("closed");
    }
  };

  return handle;
}
