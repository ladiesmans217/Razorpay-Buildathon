import { NextResponse } from "next/server";
import { buildNotifyCaregiverPayload, buildOrientationEvent } from "@/lib/ai/live-tools";
import { DEMO_PATIENT_ID, seedState } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side tool execution for Lumo Live.
 * Face match stays client-side (Human embeddings). These tools handle SOS + summaries.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || body.tool || "");
  const args = (body.args || body.arguments || {}) as Record<string, unknown>;

  try {
    if (name === "notify_caregiver") {
      const payload = buildNotifyCaregiverPayload({
        reason: typeof args.reason === "string" ? args.reason : undefined,
        patient_id: typeof args.patient_id === "string" ? args.patient_id : DEMO_PATIENT_ID,
        latitude: typeof args.latitude === "number" ? args.latitude : undefined,
        longitude: typeof args.longitude === "number" ? args.longitude : undefined
      });

      const origin = new URL(request.url).origin;
      const sos = await fetch(`${origin}/api/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then((res) => res.json());

      return NextResponse.json({
        ok: true,
        tool: name,
        message: sos.message || "Caregiver notified.",
        sos
      });
    }

    if (name === "save_orientation_note") {
      const summary =
        typeof args.summary === "string" ? args.summary : "Live orientation note from Lumo session.";
      const risk = typeof args.risk_score === "number" ? args.risk_score : 30;
      const event = buildOrientationEvent(summary, risk);
      return NextResponse.json({
        ok: true,
        tool: name,
        event: {
          ...event,
          id: `live_orient_${Date.now()}`,
          patient_id: DEMO_PATIENT_ID,
          timestamp: new Date().toISOString(),
          location: seedState.patients[0]?.home_location || "Home",
          people_involved: [],
          action_items: ["Caregiver may review this Live orientation note."]
        }
      });
    }

    if (name === "get_care_summary") {
      const patient = seedState.patients[0];
      const caregiver = seedState.caregivers[0];
      const people = seedState.people
        .filter((p) => p.consent_status === "consented")
        .map((p) => `${p.name} (${p.relation})`)
        .join(", ");
      return NextResponse.json({
        ok: true,
        tool: name,
        summary: {
          patient: patient?.name,
          caregiver: caregiver?.name,
          home: patient?.home_location,
          language: patient?.primary_language,
          trusted_people: people,
          note: "RememberMe does not diagnose. Use for orientation only."
        }
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown tool: ${name}` }, { status: 400 });
  } catch (error) {
    console.error("Live tool failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Tool failed" },
      { status: 500 }
    );
  }
}
