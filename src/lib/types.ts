export type Role =
  | "family"
  | "neighbour"
  | "asha"
  | "pharmacy"
  | "rwa"
  | "doctor"
  | "volunteer"
  | "caregiver";

export type TrustLevel = "primary" | "trusted" | "community" | "emergency_only";
export type PrivacyLevel = "private" | "caregiver_only" | "care_circle" | "emergency";
export type RetentionPolicy = "24_hours" | "72_hours" | "7_days" | "saved";
export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Patient {
  id: string;
  name: string;
  age: number;
  condition_stage: string;
  primary_language: string;
  home_location: string;
  safe_zone_radius: number;
  emergency_contacts: string[];
  doctor_name: string;
  medical_notes: string;
  medication_schedule: string[];
  privacy_settings: string[];
}

export interface Caregiver {
  id: string;
  patient_id: string;
  name: string;
  relation: string;
  phone: string;
  email: string;
  notification_preferences: string[];
}

export interface PersonProfile {
  id: string;
  patient_id: string;
  name: string;
  relation: string;
  role: Role;
  trust_level: TrustLevel;
  profile_photo_url: string;
  face_embedding?: number[];
  face_embedding_model?: string;
  face_samples?: number;
  face_embedding_updated_at?: string;
  memory_note: string;
  allowed_visibility: PrivacyLevel;
  last_seen_at: string;
  last_seen_location: string;
  last_conversation_summary: string;
  consent_status: "consented" | "pending" | "declined";
}

export type MemoryEventType =
  | "person_seen"
  | "conversation"
  | "memory_journal"
  | "medication_taken"
  | "medication_missed"
  | "safe_zone_exit"
  | "safe_place_visit"
  | "risky_place_entry"
  | "unknown_person_detected"
  | "asha_visit"
  | "pharmacy_delivery"
  | "caregiver_checkin"
  | "neighbour_help"
  | "rwa_response"
  | "doctor_note"
  | "carelearn_training_completed"
  | "orientation_check"
  | "sos_triggered"
  | "ambient_conversation_detected"
  | "consented_person_named"
  | "consented_photo_captured"
  | "consented_transcript_saved"
  | "front_camera_identification";

export interface MemoryEvent {
  id: string;
  patient_id: string;
  event_type: MemoryEventType;
  timestamp: string;
  source:
    | "camera"
    | "mobile"
    | "voice"
    | "watch"
    | "wearos"
    | "gps"
    | "caregiver"
    | "neighbour"
    | "asha"
    | "pharmacy"
    | "rwa"
    | "carelearn"
    | "ndli"
    | "capture";
  location: string;
  people_involved: string[];
  summary: string;
  raw_transcript?: string;
  risk_score: number;
  privacy_level: PrivacyLevel;
  media_url?: string;
  retention_policy: RetentionPolicy;
  action_items: string[];
}

export interface PlaceMemory {
  id: string;
  patient_id: string;
  name: string;
  type: "home" | "temple" | "pharmacy" | "park" | "neighbour_house" | "clinic" | "traffic_junction" | "bus_stop" | "risky_place";
  location: string;
  latitude?: number;
  longitude?: number;
  risk_radius_m?: number;
  safety_level: "safe" | "neutral" | "risky";
  notes: string;
  last_visit_at: string;
  usual_companions: string[];
}

export interface Alert {
  id: string;
  patient_id: string;
  alert_type: "safe_zone_exit" | "unknown_person" | "missed_medicine" | "cognitive_dip" | "no_response" | "emergency" | "risky_place" | "sos";
  severity: AlertSeverity;
  message: string;
  recipients: Role[];
  status: "pending" | "acknowledged" | "resolved";
  created_at: string;
  resolved_at?: string;
  linked_memory_event_id: string;
}

export interface CommunityTask {
  id: string;
  patient_id: string;
  alert_id: string;
  assigned_role: "neighbour" | "asha" | "pharmacy" | "rwa" | "caregiver";
  assigned_to: string;
  task_title: string;
  task_steps: string[];
  status: "pending" | "accepted" | "reached" | "completed" | "cancelled";
  created_at: string;
  completed_at?: string;
}

/** CareLearn training pack (Gemini-generated or seeded). */
export interface CareLearnResource {
  id: string;
  title: string;
  query: string;
  role: Role[];
  use_case: string;
  language: string[];
  /** Legacy field name kept for stored state shape; unused in UI. */
  ndli_search_url: string;
  summary: string;
  generated_training_card: string;
  quiz_questions: string[];
  source_type: "curated" | "generated" | "carelearn";
}

/** @deprecated Use CareLearnResource */
export type NDLIResource = CareLearnResource;

export interface CareBadge {
  id: string;
  title: string;
  description: string;
  earned_at: string;
}

export interface CareLearnTraining {
  id: string;
  patient_id: string;
  role: Role;
  resource_ids: string[];
  generated_card: string;
  quiz_score: number;
  completed_by: string;
  completed_at: string;
  event_context: string;
}

export interface DoctorReport {
  id: string;
  patient_id: string;
  date_range: string;
  medication_adherence: string;
  wandering_events: number;
  night_exits: number;
  safe_place_visits: number;
  known_visitors: number;
  unknown_visitors: number;
  memory_journal_topics: string[];
  mood_notes: string;
  caregiver_notes: string;
  asha_notes: string;
  pharmacy_notes: string;
  carelearn_recommendations: string[];
  suggested_discussion_points: string[];
  generated_summary: string;
  disclaimer: string;
  created_at: string;
}

export interface MobileFrame {
  id: string;
  patient_id: string;
  data_url: string;
  captured_at: string;
  source_device: "android_phone" | "browser" | "upload";
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  recognition?: {
    status: "matched" | "unknown" | "no_face" | "fallback";
    person_id?: string;
    person_name?: string;
    similarity?: number;
    distance?: number;
    note?: string;
  };
}

export type CaptureSessionStatus =
  | "idle"
  | "movement_detected"
  | "speech_candidate"
  | "ask_save_name"
  | "ask_photo_consent"
  | "ask_transcript_consent"
  | "recording"
  | "summarizing"
  | "saved"
  | "declined"
  | "cancelled";

export interface CaptureSession {
  id: string;
  patient_id: string;
  trigger: "movement_speech_detected" | "manual_who_is_this" | "demo";
  status: CaptureSessionStatus;
  started_at: string;
  ended_at?: string;
  source_device: "android_phone" | "browser" | "wearos" | "demo";
  movement_source?: "steps" | "gps" | "manual";
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    human_label?: string;
  };
  speech_snippet?: string;
  speech_classification?: "self_talk" | "shop_transaction" | "meaningful_social" | "caregiver_help" | "unsafe";
  person_name?: string;
  person_description?: string;
  linked_person_id?: string;
  consent: {
    name: boolean;
    photo: boolean;
    transcript: boolean;
  };
  privacy_level: PrivacyLevel;
  retention_policy: RetentionPolicy;
  risk_score: number;
  audit_log: Array<{
    timestamp: string;
    actor: "patient" | "lumo" | "caregiver" | "system";
    action: string;
    note: string;
  }>;
}

export interface CaptureMedia {
  id: string;
  patient_id: string;
  session_id: string;
  kind: "photo" | "transcript" | "audio_summary";
  captured_at: string;
  storage_path?: string;
  media_url?: string;
  transcript_text?: string;
  summary?: string;
  linked_person_id?: string;
  location?: CaptureSession["location"];
  metadata: {
    source_device: "android_phone" | "browser" | "wearos" | "demo";
    consent_status: "consented" | "declined" | "candidate";
    retained_until?: string;
    face_status?: "matched" | "unknown" | "no_face" | "not_processed";
  };
  privacy_level: PrivacyLevel;
  retention_policy: RetentionPolicy;
}

export interface CaptureCommand {
  id: string;
  patient_id: string;
  command: "capture_front_person";
  status: "pending" | "processing" | "completed" | "cancelled";
  requested_at: string;
  requested_by: "watch" | "caregiver" | "patient";
  prompt: string;
  session_id?: string;
  result_cue_id?: string;
}

export interface LatestLocation {
  patient_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  captured_at: string;
  source: "browser_gps" | "mobile_phone" | "wearos" | "simulated";
  distance_from_home_m?: number;
  geofence_status?: "inside" | "outside";
  risk_level?: AlertSeverity;
}

export interface WearEvent {
  id: string;
  patient_id: string;
  type:
    | "ok_checkin"
    | "notify_caregiver"
    | "location_ping"
    | "alert_acknowledged"
    | "talk_turn"
    | "health_sync"
    | "geofence_exit"
    | "sos_sent"
    | "bystander_help";
  timestamp: string;
  message: string;
  latitude?: number;
  longitude?: number;
}

export interface HealthSnapshot {
  id: string;
  patient_id: string;
  steps_today: number;
  distance_m: number;
  active_minutes: number;
  latest_heart_rate_bpm?: number;
  resting_heart_rate_bpm?: number;
  sleep_minutes?: number;
  sleep_quality_label?: "good" | "fair" | "restless" | "unknown";
  calories?: number;
  source: "wearos_live" | "demo" | "mixed";
  mocked_fields: string[];
  captured_at: string;
}

export interface RewardTransaction {
  id: string;
  patient_id: string;
  points: number;
  reason: string;
  source: "carelearn" | "redeem" | "demo" | "carecircle" | "checkin" | "badge" | "streak";
  created_at: string;
}

export interface WatchTalkResponse {
  reply: string;
  intent:
    | "identity"
    | "recognized_person"
    | "lumo_identity"
    | "patient_identity"
    | "person_lookup"
    | "memory_recall"
    | "recent_memory"
    | "confusion"
    | "location"
    | "location_safety"
    | "caregiver_alert"
    | "caregiver_action"
    | "checkin"
    | "medicine"
    | "routine"
    | "health_summary"
    | "carelearn_learning"
    | "ndli_learning"
    | "doctor_brief"
    | "public_search"
    | "ambient_capture_consent"
    | "front_camera_identification"
    | "capture_stop"
    | "safety"
    | "stop"
    | "general";
  risk_level: AlertSeverity;
  action: "answer_only" | "notify_caregiver" | "ok_checkin" | "end_session" | "request_camera_frame" | "start_capture_session" | "stop_capture_session";
  should_end_session: boolean;
  capture_update?: {
    kind: "name" | "photo" | "transcript" | "cancel" | "complete";
    accepted: boolean;
    person_name?: string;
    person_description?: string;
  };
}

export interface WatchCue {
  id: string;
  patient_id: string;
  cue: string;
  source_event: "person_recognition" | "safepath" | "manual" | "routine" | "capture";
  created_at: string;
  person_name?: string;
  relation?: string;
  should_vibrate: boolean;
  speak_mode: "text_only" | "speech_synthesis" | "native_tts";
}

export interface CareState {
  patients: Patient[];
  caregivers: Caregiver[];
  people: PersonProfile[];
  /** Person ids removed on purpose — blocks localStorage from resurrecting them into Firebase. */
  deletedPersonIds?: string[];
  places: PlaceMemory[];
  memoryEvents: MemoryEvent[];
  alerts: Alert[];
  communityTasks: CommunityTask[];
  ndliResources: NDLIResource[];
  careLearnTrainings: CareLearnTraining[];
  doctorReports: DoctorReport[];
  latestMobileFrame?: MobileFrame;
  captureSessions: CaptureSession[];
  captureMedia: CaptureMedia[];
  latestCaptureCommand?: CaptureCommand;
  latestLocation?: LatestLocation;
  latestHealthSnapshot?: HealthSnapshot;
  wearEvents: WearEvent[];
  latestWatchCue?: WatchCue;
  rewardPoints: number;
  rewardTransactions: RewardTransaction[];
  careBadges?: CareBadge[];
  careStreakDays?: number;
  lastCareActivityAt?: string;
  demoStep: number;
  mode: "demo" | "firebase";
}

export interface ConversationSummary {
  who: string;
  topic: string;
  summary: string;
  emotion: string;
  action_item: string;
  future_prompt: string;
}

export interface PatientCue {
  cue: string;
}

export interface WanderingAssessment {
  risk_level: AlertSeverity;
  caregiver_message: string;
  patient_message: string;
  community_action: string;
}

export interface PrivacyDecision {
  store_raw_media: boolean;
  blur_unknown_faces: boolean;
  visibility: PrivacyLevel;
  retention: RetentionPolicy;
  reason: string;
}

export interface TrainingCard {
  resource_topics: string[];
  /** @deprecated prefer learning_topics */
  ndli_queries?: string[];
  learning_topics?: string[];
  role_specific_card: string;
  learn_steps?: string[];
  do_steps?: string[];
  do_not_steps?: string[];
  scenario?: string;
  quiz_questions: string[];
}

export interface AwarenessEvent {
  title: string;
  audience: string;
  duration: string;
  agenda: string[];
  roleplay_activity: string;
  /** @deprecated prefer learning_topics */
  ndli_search_topics?: string[];
  learning_topics?: string[];
  volunteer_checklist: string[];
  quiz_questions: string[];
  attendance_structure: string;
}
