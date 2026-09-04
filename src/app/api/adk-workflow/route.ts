import { NextResponse } from "next/server";
import { adkWorkflowSummary } from "@/lib/agents/workflow";

export async function GET() {
  return NextResponse.json(adkWorkflowSummary());
}
