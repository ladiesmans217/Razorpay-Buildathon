import { NextResponse } from "next/server";
import { recognizeFaceOnServer } from "@/lib/vision/face-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      dataUrl?: string;
      data_url?: string;
      embedding?: number[];
      patientId?: string;
      patient_id?: string;
      threshold?: number;
    };

    const result = await recognizeFaceOnServer({
      dataUrl: body.dataUrl || body.data_url,
      embedding: body.embedding,
      patientId: body.patientId || body.patient_id,
      threshold: body.threshold
    });

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Face recognition failed";
    return NextResponse.json(
      {
        ok: false,
        status: "no_face",
        person: null,
        similarity: null,
        label: "Recognition error",
        detail: message,
        cue: "I could not finish face matching. Please try Capture photo again.",
        method: "fallback",
        error: message
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
