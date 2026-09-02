export const careGridAgents = [
  {
    name: "Memory Ingestion Agent",
    tool: "create_memory_event",
    purpose: "Turns camera, voice, GPS, watch, caregiver, ASHA, pharmacy, and RWA signals into structured MemoryEvents."
  },
  {
    name: "Face Match Agent",
    tool: "match_trusted_person",
    purpose: "Matches only enrolled trusted people using consented face embeddings. Unknown faces stay unknown."
  },
  {
    name: "Conversation Agent",
    tool: "summarize_conversation",
    purpose: "Summarizes short interactions into recall-safe caregiver memory."
  },
  {
    name: "Patient Cue Agent",
    tool: "generate_lumo_cue",
    purpose: "Creates short, calm Lumo Companion prompts without pretending to be human."
  },
  {
    name: "Privacy Agent",
    tool: "decide_privacy",
    purpose: "Applies data minimization, retention, and sharing policy to each event."
  },
  {
    name: "Wandering Agent",
    tool: "assess_wandering_risk",
    purpose: "Classifies safe-zone exits and proposes caregiver/community actions."
  },
  {
    name: "Community Agent",
    tool: "create_carecircle_task",
    purpose: "Turns alerts into neighbour, ASHA, pharmacy, or RWA tasks."
  },
  {
    name: "CareLearn Training Agent",
    tool: "generate_carelearn_card",
    purpose: "Creates Gemini CareLearn packs and role-specific training cards for the community ring."
  },
  {
    name: "Doctor Report Agent",
    tool: "generate_doctor_report",
    purpose: "Prepares doctor-ready weekly summaries without diagnosis claims."
  }
];

export function adkWorkflowSummary() {
  return {
    framework: "@google/adk TypeScript 1.1.0 compatible",
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    workflow:
      "Memory Ingestion -> Privacy -> Patient Cue -> Caregiver -> Community -> CareLearn -> Doctor Report",
    agents: careGridAgents
  };
}
