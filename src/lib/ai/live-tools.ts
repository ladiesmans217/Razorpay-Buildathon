import type { PersonProfile } from "@/lib/types";

export type LiveToolName = "notify_caregiver" | "save_orientation_note" | "get_care_summary";

export interface LiveToolDeclaration {
  name: LiveToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export const LIVE_TOOL_DECLARATIONS: LiveToolDeclaration[] = [
  {
    name: "notify_caregiver",
    description:
      "Notify the primary caregiver that the patient or a bystander needs help. Use when the speaker is lost, scared, or asks for family.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Short calm reason, e.g. patient feels lost or bystander requested help."
        },
        patient_id: {
          type: "string",
          description: "Patient id if known."
        }
      },
      required: ["reason"]
    }
  },
  {
    name: "save_orientation_note",
    description: "Save a short non-clinical orientation or safety note to the care timeline.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "One or two sentence summary of what was said or needed."
        },
        risk_score: {
          type: "number",
          description: "Optional risk score 0-100."
        }
      },
      required: ["summary"]
    }
  },
  {
    name: "get_care_summary",
    description: "Get a short summary of patient, caregiver, and trusted people for orientation.",
    parameters: {
      type: "object",
      properties: {
        patient_id: { type: "string", description: "Patient id if known." }
      }
    }
  }
];

export function liveToolsForSession() {
  return [
    {
      functionDeclarations: LIVE_TOOL_DECLARATIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }))
    }
  ];
}

export function buildNotifyCaregiverPayload(args: {
  reason?: string;
  patient_id?: string;
  latitude?: number;
  longitude?: number;
}) {
  return {
    patient_id: args.patient_id || "patient_rajamma",
    type: "notify_caregiver" as const,
    message:
      args.reason ||
      "Lumo Live requested caregiver support because the speaker felt lost, stressed, or needed help.",
    latitude: args.latitude,
    longitude: args.longitude
  };
}

export function formatTrustedPeopleForLive(people: PersonProfile[]) {
  return people
    .filter((person) => person.consent_status === "consented")
    .map((person) => ({
      name: person.name,
      relation: person.relation,
      memoryNote: person.memory_note,
      hasFaceEmbedding: Boolean(person.face_embedding?.length)
    }));
}

export function buildOrientationEvent(summary: string, riskScore = 30) {
  return {
    event_type: "orientation_check" as const,
    summary,
    risk_score: Math.max(0, Math.min(100, Number(riskScore) || 30)),
    source: "voice" as const,
    privacy_level: "caregiver_only" as const,
    retention_policy: "7_days" as const
  };
}
