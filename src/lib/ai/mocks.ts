import type {
  AwarenessEvent,
  ConversationSummary,
  DoctorReport,
  PatientCue,
  PrivacyDecision,
  TrainingCard,
  WanderingAssessment
} from "@/lib/types";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export const mockConversationSummary: ConversationSummary = {
  who: "Lakshmi",
  topic: "lunch and medicine",
  summary: "Lakshmi reminded Rajamma to eat lunch before taking medicine.",
  emotion: "friendly",
  action_item: "Check if medicine was taken.",
  future_prompt: "Ask Lakshmi about lunch and medicine if she visits again."
};

export const mockPatientCue: PatientCue = {
  cue: "This is Lakshmi aunty. She is your neighbour from downstairs. You met her yesterday near the temple. She reminded you about lunch and medicine."
};

export const mockMemoryJournal = {
  memory_topic: "Mysore trip with husband",
  emotion: "happy",
  people: ["husband"],
  location: "Mysore",
  summary: "Rajamma remembered a happy trip to Mysore with her husband.",
  future_conversation_starter: "Ask Rajamma about the Mysore trip and wedding saree."
};

export const mockWanderingAssessment: WanderingAssessment = {
  risk_level: "high",
  caregiver_message:
    "Rajamma left the safe zone near MSRIT gate. Nearest safe point is Lakshmi neighbour, 120m away. Notify care circle?",
  patient_message:
    "You are safe. Please stop near the shop. Your daughter is being contacted. Do not cross the road.",
  community_action: "Ask Lakshmi to check in and keep Rajamma away from traffic until Ananya confirms."
};

export const mockPrivacyDecision: PrivacyDecision = {
  store_raw_media: false,
  blur_unknown_faces: true,
  visibility: "caregiver_only",
  retention: "72_hours",
  reason:
    "The event can be summarized without storing raw media. Unknown people should remain unidentified and blurred by default."
};

export const mockTrainingCard: TrainingCard = {
  resource_topics: [
    "Wandering safety for neighbours",
    "Calm communication with elders",
    "When to notify the caregiver"
  ],
  learning_topics: [
    "Approach from the front",
    "One instruction at a time",
    "CareCircle notify flow"
  ],
  role_specific_card:
    "CareLearn · Neighbour training card\n\nHow to help Rajamma if she seems lost:\n1. Speak slowly and use her name.\n2. Do not argue or ask many questions.\n3. Offer water if she is calm.\n4. Keep her away from traffic.\n5. Notify caregiver in CareGrid.\n6. Wait until family or a trusted volunteer confirms she is safe.",
  learn_steps: [
    "Wandering can look like confusion, not intentional leaving.",
    "Calm voice and familiar name reduce fear.",
    "Caregiver notification is the priority after safety."
  ],
  do_steps: [
    "Approach from the front and say her name.",
    "Guide toward a quiet safe place.",
    "Notify caregiver before sharing details with others."
  ],
  do_not_steps: [
    "Do not argue or test memory.",
    "Do not crowd her with many people.",
    "Do not post private medical details in the apartment group."
  ],
  scenario:
    "Rajamma is near the temple gate and seems unsure. Practice one calm sentence, one safety action, and one caregiver notification.",
  quiz_questions: [
    "Should you argue with a confused dementia patient?",
    "Should you ask many questions quickly?",
    "What is the first thing to do near traffic?",
    "Who should be notified?",
    "Should private details be shared publicly?"
  ]
};

export const mockAwarenessEvent: AwarenessEvent = {
  title: "Dementia-Friendly Apartment Awareness Session",
  audience: "Neighbours, RWA volunteers, pharmacy partners, ASHA workers, and student volunteers",
  duration: "30 minutes",
  agenda: [
    "What dementia can look like in daily life",
    "Why wandering happens",
    "How to speak calmly",
    "What not to do",
    "How RememberMe CareGrid coordinates care",
    "Roleplay: helping a lost elderly person",
    "Five-question quiz"
  ],
  roleplay_activity:
    "One volunteer plays a confused elder near the gate; another practices calm approach and caregiver notification.",
  learning_topics: [
    "Wandering safety basics",
    "Calm elderly communication",
    "Community mental health support",
    "Caregiver stress signals"
  ],
  volunteer_checklist: [
    "Keep phone charged",
    "Know the caregiver notify flow",
    "Do not crowd the patient",
    "Mark reached only after arriving",
    "Mark safe only after caregiver confirms"
  ],
  quiz_questions: mockTrainingCard.quiz_questions,
  attendance_structure: "Name, apartment block, role, phone, quiz score, consent for CareCircle alerts"
};

export function mockDoctorReport(): DoctorReport {
  return {
    id: uid("doctor_report"),
    patient_id: DEMO_PATIENT_ID,
    date_range: "September 1 to September 4, 2026",
    medication_adherence: "83 percent",
    wandering_events: 2,
    night_exits: 1,
    safe_place_visits: 3,
    known_visitors: 4,
    unknown_visitors: 1,
    memory_journal_topics: ["Mysore trip", "wedding saree"],
    mood_notes: "Calm during known-neighbour interaction. Smiled while recalling Mysore.",
    caregiver_notes: "More confusion after poor sleep.",
    asha_notes: "Caregiver reports disturbed sleep this week.",
    pharmacy_notes: "Monthly refill due Monday. Pharmacy partner should confirm with caregiver.",
    carelearn_recommendations: [
      "Dementia wandering safety",
      "Caregiver stress support",
      "Medication routine support"
    ],
    suggested_discussion_points: [
      "Sleep disturbance and wandering risk",
      "Medication routine after food",
      "Caregiver stress and support options"
    ],
    generated_summary:
      "Rajamma had two wandering-related events this week, one night exit, and mostly stable known-person interactions. This report is based on caregiver and device logs and should be reviewed by a clinician.",
    disclaimer: "This report is generated from caregiver and device logs. It is not a medical diagnosis.",
    created_at: new Date().toISOString()
  };
}
