import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { buildLumoLiveSystemInstruction } from "@/lib/ai/live-system-prompt";
import { liveToolsForSession } from "@/lib/ai/live-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

export async function POST(request: Request) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GEMINI_API_KEY is not set. Add it to .env.local to use Lumo Live. The rest of CareGrid still works in demo mode."
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const model =
    (typeof body.model === "string" && body.model) ||
    process.env.GEMINI_LIVE_MODEL ||
    "gemini-3.1-flash-live-preview";

  const systemInstruction = buildLumoLiveSystemInstruction({
    patientName: body.patientName,
    caregiverName: body.caregiverName,
    homeLocation: body.homeLocation,
    primaryLanguage: body.primaryLanguage,
    trustedPeopleSummary: body.trustedPeopleSummary
  });

  const affectiveEnabled =
    process.env.ENABLE_AFFECTIVE_DIALOG === "true" && model.includes("2.5");

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" }
    });

    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const liveConfig: Record<string, unknown> = {
      responseModalities: ["AUDIO"],
      systemInstruction,
      sessionResumption: {},
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: liveToolsForSession(),
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
      }
    };

    if (affectiveEnabled) {
      liveConfig.enableAffectiveDialog = true;
    }

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: liveConfig
        },
        httpOptions: { apiVersion: "v1alpha" }
      }
    });

    const tokenName = (token as { name?: string }).name;
    if (!tokenName) {
      return NextResponse.json(
        { ok: false, error: "Ephemeral token response missing name." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      token: tokenName,
      model,
      affectiveEnabled,
      expiresAt: expireTime
    });
  } catch (error) {
    console.error("Live token create failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create Live ephemeral token"
      },
      { status: 502 }
    );
  }
}

export async function GET() {
  return POST(new Request("http://local/api/live/token", { method: "POST", body: "{}" }));
}
