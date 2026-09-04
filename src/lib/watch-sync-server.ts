import { doc, getDoc, setDoc } from "firebase/firestore/lite";
import { getFirebaseServerDb } from "./firebase-server";
import { assessGeofence, googleMapsLink, type GeofenceAssessment } from "./geofence";
import { DEMO_PATIENT_ID, seedState } from "./seed";
import { sendTwilioSos, type TwilioDelivery } from "./twilio";
import type { Alert, CareState, CommunityTask, HealthSnapshot, LatestLocation, MemoryEvent, WatchCue, WearEvent } from "./types";

const DEMO_DOC = ["demoState", "rememberme-caregrid"] as const;
const WATCH_CUE_DOC = ["watchCues", "latest"] as const;

export const fallbackWatchCue: WatchCue =
  seedState.latestWatchCue || {
    id: "watch_cue_fallback",
    patient_id: DEMO_PATIENT_ID,
    cue: "Good morning Rajamma. Today is Friday. Ananya will visit this evening. Let us start slowly.",
    source_event: "routine",
    created_at: new Date().toISOString(),
    should_vibrate: false,
    speak_mode: "speech_synthesis"
  };

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefined(item)])
    );
  }
  return value;
}

function mainFirestoreState(state: CareState) {
  const { latestMobileFrame: _latestMobileFrame, ...rest } = state;
  return stripUndefined({ ...rest, mode: "firebase" });
}

function hydrateCareState(state: CareState): CareState {
  const seedPlaces = new Map(seedState.places.map((place) => [place.id, place]));
  const deleted = new Set(state.deletedPersonIds || []);
  return {
    ...state,
    people: (state.people || []).filter((person) => !deleted.has(person.id)),
    places: (state.places || seedState.places).map((place) => {
      const seed = seedPlaces.get(place.id);
      return {
        ...seed,
        ...place,
        latitude: place.latitude ?? seed?.latitude,
        longitude: place.longitude ?? seed?.longitude,
        risk_radius_m: place.risk_radius_m ?? seed?.risk_radius_m
      };
    })
  };
}

export async function loadCareState(): Promise<CareState> {
  const db = getFirebaseServerDb();
  if (!db) return hydrateCareState(JSON.parse(JSON.stringify({ ...seedState, mode: "demo" })) as CareState);
  const snapshot = await getDoc(doc(db, ...DEMO_DOC));
  if (!snapshot.exists()) return hydrateCareState(JSON.parse(JSON.stringify({ ...seedState, mode: "firebase" })) as CareState);
  return hydrateCareState({ ...seedState, ...(snapshot.data() as CareState), mode: "firebase" });
}

export async function saveCareState(state: CareState) {
  const db = getFirebaseServerDb();
  if (!db) return false;
  await setDoc(doc(db, ...DEMO_DOC), mainFirestoreState(state) as Record<string, unknown>, { merge: true });
  if (state.latestWatchCue) {
    await setDoc(doc(db, ...WATCH_CUE_DOC), stripUndefined(state.latestWatchCue) as Record<string, unknown>);
  }
  return true;
}

export async function readLatestWatchCue() {
  const db = getFirebaseServerDb();
  if (!db) return { cue: fallbackWatchCue, stored: false };

  const liveSnapshot = await getDoc(doc(db, ...WATCH_CUE_DOC));
  if (liveSnapshot.exists()) return { cue: liveSnapshot.data() as WatchCue, stored: true };

  const state = await loadCareState();
  return { cue: state.latestWatchCue || fallbackWatchCue, stored: true };
}

export async function saveLatestWatchCue(cue: WatchCue) {
  const db = getFirebaseServerDb();
  if (!db) return false;

  await setDoc(doc(db, ...WATCH_CUE_DOC), stripUndefined(cue) as Record<string, unknown>);
  const state = await loadCareState();
  await saveCareState({ ...state, latestWatchCue: cue });
  return true;
}

export async function appendWearEvent(event: WearEvent) {
  const state = await loadCareState();
  const isCaregiverSosEvent = event.type === "notify_caregiver" || event.type === "bystander_help";
  const notifyShouldSendSos = isCaregiverSosEvent && !hasRecentOpenSos(state, "notify_caregiver");
  const notifyAlert = isCaregiverSosEvent ? watchNotifyAlert(event) : null;
  const alerts = notifyAlert ? [notifyAlert, ...state.alerts] : state.alerts;
  const acknowledgedAlerts =
    event.type === "alert_acknowledged"
      ? alerts.map((alert) =>
          alert.status === "pending"
            ? { ...alert, status: "acknowledged" as const, resolved_at: new Date().toISOString() }
            : alert
        )
      : alerts;

  const hasFreshCoords = typeof event.latitude === "number" && typeof event.longitude === "number";
  // Only update map when this event carries coordinates. Empty pings keep last known, no re-SOS on stale point.
  const rawLatestLocation: LatestLocation | undefined = hasFreshCoords
    ? {
        patient_id: event.patient_id,
        latitude: event.latitude as number,
        longitude: event.longitude as number,
        captured_at: event.timestamp,
        source: "wearos"
      }
    : state.latestLocation;

  let assessment: GeofenceAssessment | undefined;
  const latestLocation = rawLatestLocation
    ? enrichLocationWithAssessment({ ...state, alerts: acknowledgedAlerts }, rawLatestLocation)
    : rawLatestLocation;
  if (latestLocation && event.type === "location_ping" && hasFreshCoords) {
    assessment = assessGeofence({ ...state, alerts: acknowledgedAlerts }, latestLocation);
  }

  let nextState: CareState = {
    ...state,
    alerts: acknowledgedAlerts,
    latestLocation,
    wearEvents: [event, ...(state.wearEvents || [])].slice(0, 30)
  };

  let sosDelivery: TwilioDelivery | undefined;
  if (assessment?.should_sos && !hasRecentOpenSos(nextState, assessment.trigger_reason)) {
    const sos = buildGeofenceSos(nextState, latestLocation!, assessment, event);
    nextState = {
      ...nextState,
      memoryEvents: [sos.memoryEvent, ...nextState.memoryEvents],
      alerts: [sos.alert, ...nextState.alerts],
      communityTasks: [sos.task, ...nextState.communityTasks],
      latestWatchCue: sos.watchCue,
      wearEvents: [sos.wearEvent, ...nextState.wearEvents].slice(0, 30)
    };
    // Await so delivery status is real (not fire-and-forget silent fail).
    sosDelivery = await sendSosNotification(nextState, sos.alert.message, latestLocation, "geofence");
  } else if (assessment?.should_sos) {
    sosDelivery = {
      enabled: false,
      sms: "skipped",
      call: "skipped",
      error: "Recent SOS already pending; duplicate SMS/call skipped."
    };
  } else if (notifyAlert && notifyShouldSendSos) {
    sosDelivery = await sendSosNotification(nextState, notifyAlert.message, latestLocation, "caregiver_request");
  } else if (notifyAlert) {
    // Still attempt Twilio for manual notify if prior "pending" never actually dialed (demo phone / failed send).
    sosDelivery = await sendSosNotification(nextState, notifyAlert.message, latestLocation, "caregiver_request");
    if (sosDelivery.sms === "sent" || sosDelivery.call === "sent") {
      // keep
    } else if (!sosDelivery.error?.includes("missing")) {
      sosDelivery = {
        ...sosDelivery,
        error:
          sosDelivery.error ||
          "Notify recorded in CareGrid. If no SMS/call, check Twilio number verification and server logs."
      };
    }
  }

  const stored = await saveCareState(nextState);
  return { event, stored, geofence: assessment, sosDelivery };
}

export async function saveHealthSnapshot(snapshot: HealthSnapshot) {
  const state = await loadCareState();
  const event: WearEvent = {
    id: `wear_health_${Date.now()}`,
    patient_id: snapshot.patient_id,
    type: "health_sync",
    timestamp: snapshot.captured_at,
    message: `Galaxy Watch health sync: ${snapshot.steps_today} steps, ${snapshot.active_minutes} active minutes, ${snapshot.sleep_minutes ?? "unknown"} sleep minutes.`
  };
  const nextState: CareState = {
    ...state,
    latestHealthSnapshot: snapshot,
    wearEvents: [event, ...(state.wearEvents || [])].slice(0, 30)
  };
  const stored = await saveCareState(nextState);
  return { snapshot, event, stored };
}

function watchNotifyAlert(event: WearEvent): Alert {
  return {
    id: `alert_watch_${Date.now()}`,
    patient_id: event.patient_id,
    alert_type: "emergency",
    severity: "high",
    message: event.message || "Rajamma tapped notify caregiver on Galaxy Watch.",
    recipients: ["caregiver"],
    status: "pending",
    created_at: event.timestamp,
    linked_memory_event_id: event.id
  };
}

function enrichLocationWithAssessment(state: CareState, location: LatestLocation): LatestLocation {
  const assessment = assessGeofence(state, location);
  return {
    ...location,
    distance_from_home_m: assessment.distance_from_home_m,
    geofence_status: assessment.status,
    risk_level: assessment.risk_level
  };
}

/** While patient stays outside the geofence, re-SOS at most once every 5 minutes (any status). */
const GEOFENCE_SOS_COOLDOWN_MS = 5 * 60 * 1000;

function hasRecentOpenSos(state: CareState, _reason: string) {
  const now = Date.now();
  return state.alerts.some((alert) => {
    // Geofence re-alerts every 5 min while still outside: count any recent geofence alert, even if resolved.
    if (["safe_zone_exit", "risky_place"].includes(alert.alert_type)) {
      return now - new Date(alert.created_at).getTime() < GEOFENCE_SOS_COOLDOWN_MS;
    }
    // Manual / emergency notify: skip duplicates while still pending within 5 min.
    if (alert.status !== "pending") return false;
    if (!["emergency", "sos", "cognitive_dip"].includes(alert.alert_type)) return false;
    return now - new Date(alert.created_at).getTime() < GEOFENCE_SOS_COOLDOWN_MS;
  });
}

function buildGeofenceSos(state: CareState, location: LatestLocation, assessment: GeofenceAssessment, event: WearEvent) {
  const patient = state.patients[0];
  const timestamp = new Date().toISOString();
  const alertType = assessment.trigger_reason === "near_risky_place" ? "risky_place" : "safe_zone_exit";
  const alert: Alert = {
    id: `alert_sos_${Date.now()}`,
    patient_id: event.patient_id,
    alert_type: alertType,
    severity: assessment.risk_level,
    message: assessment.caregiver_message,
    recipients: ["caregiver", "neighbour", "rwa"],
    status: "pending",
    created_at: timestamp,
    linked_memory_event_id: event.id
  };
  const memoryEvent: MemoryEvent = {
    id: `event_sos_${Date.now()}`,
    patient_id: event.patient_id,
    event_type: assessment.trigger_reason === "near_risky_place" ? "risky_place_entry" : "safe_zone_exit",
    timestamp,
    source: "wearos",
    location: googleMapsLink(location),
    people_involved: [patient?.name || "Rajamma"],
    summary: assessment.caregiver_message,
    risk_score: assessment.risk_level === "critical" ? 96 : 82,
    privacy_level: "emergency",
    retention_policy: "72_hours",
    action_items: ["SMS/call caregiver.", "Ask patient to stop near a familiar person.", "Show bystander help card if needed."]
  };
  const task: CommunityTask = {
    id: `task_sos_${Date.now()}`,
    patient_id: event.patient_id,
    alert_id: alert.id,
    assigned_role: "neighbour",
    assigned_to: "Lakshmi",
    task_title: "SOS check near latest watch location",
    task_steps: [
      "Approach calmly and say your name.",
      "Do not argue or crowd the patient.",
      "Keep the patient away from traffic.",
      "Use the QR/help card on the watch if a bystander is assisting.",
      "Wait until Ananya or a trusted volunteer confirms safety."
    ],
    status: "pending",
    created_at: timestamp
  };
  const watchCue: WatchCue = {
    id: `watch_cue_sos_${Date.now()}`,
    patient_id: event.patient_id,
    cue: assessment.patient_message,
    source_event: "safepath",
    created_at: timestamp,
    should_vibrate: true,
    speak_mode: "native_tts"
  };
  const wearEvent: WearEvent = {
    id: `wear_sos_${Date.now()}`,
    patient_id: event.patient_id,
    type: "sos_sent",
    timestamp,
    message: `SOS prepared from watch geofence: ${assessment.trigger_reason}.`,
    latitude: location.latitude,
    longitude: location.longitude
  };
  return { alert, memoryEvent, task, watchCue, wearEvent };
}

function emergencyDestination(state: CareState) {
  // Prefer real Twilio destination from env. Seed caregiver phone is "+91 demo" and must not block env.
  return (
    process.env.TWILIO_EMERGENCY_TO ||
    process.env.TWILIO_TO_NUMBER ||
    validPhone(state.caregivers[0]?.phone) ||
    undefined
  );
}

async function sendSosNotification(
  state: CareState,
  reason: string,
  location: LatestLocation | undefined,
  trigger: "geofence" | "caregiver_request"
) {
  const patient = state.patients[0];
  const map = googleMapsLink(location);
  const to = emergencyDestination(state);
  const smsBody = `RememberMe SOS: ${patient?.name || "Rajamma"} needs help. Reason: ${reason} Location: ${map}`;
  const callMessage =
    trigger === "geofence"
      ? `Hello, this is Lumo calling from ${patient?.name || "Rajamma"}'s watch. ${patient?.name || "The patient"} is outside the safe zone. I am speaking calmly with them, but please go to the location now. The location has been sent by SMS.`
      : `Hello, this is Lumo calling from ${patient?.name || "Rajamma"}'s watch. ${patient?.name || "The patient"} asked for help or seemed confused. I am speaking with them, but please check on them now. The latest location has been sent by SMS.`;
  const delivery = await sendTwilioSos({ to, smsBody, callMessage });
  console.info("[CareGrid SOS]", {
    trigger,
    to: delivery.to || to || null,
    enabled: delivery.enabled,
    sms: delivery.sms,
    call: delivery.call,
    error: delivery.error || null,
    sms_sid: delivery.sms_sid || null,
    call_sid: delivery.call_sid || null
  });
  return delivery;
}

function validPhone(value?: string) {
  if (!value || value.toLowerCase().includes("demo")) return undefined;
  return value.startsWith("+") ? value : undefined;
}
