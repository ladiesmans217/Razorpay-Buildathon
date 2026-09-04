import { NextResponse } from "next/server";
import { readLatestWatchCue, saveLatestWatchCue } from "@/lib/watch-sync-server";

export async function GET() {
  try {
    const { cue, stored } = await readLatestWatchCue();
    return NextResponse.json(
      {
        ok: true,
        stored,
        cue: cue.cue,
        watch_cue: cue,
        received_at: new Date().toISOString()
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        cue: "Lumo is offline for a moment. Please stay near a familiar place.",
        error: error instanceof Error ? error.message : "Could not read watch cue."
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const cue = {
    id: body.id || `watch_cue_${Date.now()}`,
    patient_id: body.patient_id || "patient_rajamma",
    cue: body.cue || "Lumo cue saved.",
    source_event: body.source_event || "manual",
    created_at: body.created_at || new Date().toISOString(),
    person_name: body.person_name,
    relation: body.relation,
    should_vibrate: Boolean(body.should_vibrate),
    speak_mode: body.speak_mode || "native_tts"
  };
  const stored = await saveLatestWatchCue(cue);
  return NextResponse.json({
    ok: true,
    stored,
    cue: cue.cue,
    watch_cue: cue,
    received_at: new Date().toISOString()
  });
}
