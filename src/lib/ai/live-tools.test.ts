import { describe, expect, it } from "vitest";
import {
  buildNotifyCaregiverPayload,
  buildOrientationEvent,
  formatTrustedPeopleForLive,
  LIVE_TOOL_DECLARATIONS,
  liveToolsForSession
} from "./live-tools";
import type { PersonProfile } from "@/lib/types";

describe("live tools", () => {
  it("declares notify, orientation, and care summary tools", () => {
    const names = LIVE_TOOL_DECLARATIONS.map((t) => t.name);
    expect(names).toContain("notify_caregiver");
    expect(names).toContain("save_orientation_note");
    expect(names).toContain("get_care_summary");
    const sessionTools = liveToolsForSession();
    expect(sessionTools[0].functionDeclarations?.length).toBe(3);
  });

  it("builds notify payload for SOS", () => {
    const payload = buildNotifyCaregiverPayload({
      reason: "Patient feels lost",
      patient_id: "patient_rajamma"
    });
    expect(payload.type).toBe("notify_caregiver");
    expect(payload.message).toContain("lost");
    expect(payload.patient_id).toBe("patient_rajamma");
  });

  it("builds orientation event with clamped risk", () => {
    const event = buildOrientationEvent("Felt scared near gate", 150);
    expect(event.event_type).toBe("orientation_check");
    expect(event.risk_score).toBe(100);
    expect(event.summary).toContain("scared");
  });

  it("formats only consented people", () => {
    const people = [
      { name: "A", consent_status: "consented", relation: "daughter", face_embedding: [1, 2] },
      { name: "B", consent_status: "pending", relation: "other" }
    ] as PersonProfile[];
    const formatted = formatTrustedPeopleForLive(people);
    expect(formatted).toHaveLength(1);
    expect(formatted[0].name).toBe("A");
    expect(formatted[0].hasFaceEmbedding).toBe(true);
  });
});
