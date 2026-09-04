import { NextResponse } from "next/server";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";
import type { CommunityTask } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const role = body.role || "neighbour";
  const task: CommunityTask = {
    id: uid("task"),
    patient_id: body.patient_id || DEMO_PATIENT_ID,
    alert_id: body.alert_id || "demo_alert",
    assigned_role: role,
    assigned_to: body.assigned_to || (role === "neighbour" ? "Lakshmi" : "CareCircle member"),
    task_title: body.task_title || "Check on Rajamma calmly",
    task_steps: body.task_steps || [
      "Speak slowly.",
      "Do not argue.",
      "Keep Rajamma away from traffic.",
      "Notify caregiver and wait for confirmation."
    ],
    status: "pending",
    created_at: new Date().toISOString()
  };
  return NextResponse.json(task);
}
