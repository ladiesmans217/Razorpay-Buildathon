import { NextResponse } from "next/server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    id: uid("person"),
    patient_id: body.patient_id || DEMO_PATIENT_ID,
    name: body.name || "Trusted person",
    relation: body.relation || "care circle member",
    role: body.role || "neighbour",
    trust_level: body.trust_level || "trusted",
    memory_note: body.memory_note || "",
    consent_status: body.consent_status || "consented",
    face_embedding_status: "stored_demo_embedding"
  });
}
