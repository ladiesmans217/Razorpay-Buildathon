import { NextResponse } from "next/server";
import { loadCareState } from "@/lib/watch-sync-server";

export async function GET() {
  const state = await loadCareState();
  return NextResponse.json(
    {
      ok: true,
      people: state.people.filter((person) => person.patient_id === "patient_rajamma" && person.consent_status === "consented")
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
