import { NextResponse } from "next/server";
import { loadCareState, readLatestWatchCue } from "@/lib/watch-sync-server";

export async function GET(_request: Request, context: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await context.params;
  const [{ cue }, state] = await Promise.all([readLatestWatchCue(), loadCareState()]);
  return NextResponse.json({
    ok: true,
    patient_id: patientId,
    patient: state.patients.find((patient) => patient.id === patientId) || state.patients[0],
    caregivers: state.caregivers.filter((caregiver) => caregiver.patient_id === patientId),
    people: state.people.filter((person) => person.patient_id === patientId).map(({ face_embedding: _faceEmbedding, ...person }) => ({
      ...person,
      has_face_embedding: Boolean(_faceEmbedding?.length)
    })),
    recent_events: state.memoryEvents.filter((event) => event.patient_id === patientId).slice(0, 12),
    alerts: state.alerts.filter((alert) => alert.patient_id === patientId),
    community_tasks: state.communityTasks.filter((task) => task.patient_id === patientId),
    ndli_resources: state.ndliResources,
    latest_location: state.latestLocation,
    latest_health: state.latestHealthSnapshot,
    latest_watch_cue: cue,
    wear_events: state.wearEvents.slice(0, 12)
  });
}
