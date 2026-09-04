import { NextResponse } from "next/server";
import { generateJson } from "@/lib/ai/provider";
import { mockDoctorReport } from "@/lib/ai/mocks";
import { doctorReportPrompt } from "@/lib/ai/prompts";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const fallback = mockDoctorReport();
  const generated = await generateJson(doctorReportPrompt(body.state || {}), fallback);
  return NextResponse.json({
    ...fallback,
    ...generated,
    id: generated.id || uid("doctor_report"),
    patient_id: generated.patient_id || DEMO_PATIENT_ID,
    created_at: generated.created_at || new Date().toISOString()
  });
}
