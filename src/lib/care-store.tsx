"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import type {
  Alert,
  CareBadge,
  CareLearnTraining,
  CareState,
  CommunityTask,
  ConversationSummary,
  DoctorReport,
  HealthSnapshot,
  LatestLocation,
  MemoryEvent,
  MobileFrame,
  PersonProfile,
  TrainingCard,
  WatchCue,
  WearEvent
} from "./types";
import { getFirebaseDb, firebaseConfigured } from "./firebase";
import { saveLiveWatchCue } from "./live-watch";
import { DEMO_PATIENT_ID, seedState } from "./seed";
import { uid } from "./utils";

const STORAGE_KEY = "rememberme-caregrid-state-v1";
const PEOPLE_BACKUP_KEY = "rememberme-caregrid-enrolled-people-v1";
const CHANNEL_KEY = "rememberme-caregrid-sync";
const FIREBASE_DOC = ["demoState", "rememberme-caregrid"] as const;

type Committer = (updater: (state: CareState) => CareState, label?: string) => void;

interface CareStoreValue {
  state: CareState;
  isFirebase: boolean;
  resetDemo: () => void;
  commit: Committer;
  addMemoryEvent: (event: MemoryEvent) => void;
  updatePerson: (id: string, patch: Partial<PersonProfile>) => void;
  removePerson: (id: string) => void;
  createAlert: (alert: Alert) => void;
  resolveAlert: (alertId: string) => void;
  createTask: (task: CommunityTask) => void;
  updateTask: (taskId: string, status: CommunityTask["status"]) => void;
  addTraining: (training: CareLearnTraining) => void;
  addDoctorReport: (report: DoctorReport) => void;
  setLatestMobileFrame: (frame: MobileFrame) => void;
  setLatestLocation: (location: LatestLocation) => void;
  setLatestHealthSnapshot: (snapshot: HealthSnapshot) => void;
  setLatestWatchCue: (cue: WatchCue) => void;
  addWearEvent: (event: WearEvent) => void;
  runLakshmiConversation: (summary: ConversationSummary, transcript: string) => void;
  runMemoryJournal: (journal: {
    memory_topic: string;
    emotion: string;
    people: string[];
    location: string;
    summary: string;
    future_conversation_starter: string;
  }, transcript: string) => void;
  simulateWandering: () => { alert: Alert; task: CommunityTask; event: MemoryEvent };
  markNeighbourTrained: (card: TrainingCard) => void;
}

const CareStoreContext = createContext<CareStoreValue | null>(null);

function cloneSeed(mode: CareState["mode"] = "demo"): CareState {
  return JSON.parse(JSON.stringify({ ...seedState, mode })) as CareState;
}

function loadLocalState(): CareState {
  if (typeof window === "undefined") return cloneSeed();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const backupPeople = loadBackedUpPeople();
  // Local boot may union backup enrollments (offline). Firebase snapshot merge never re-adds deleted people.
  if (!raw) {
    const base = cloneSeed();
    const deletedPersonIds = base.deletedPersonIds || [];
    return {
      ...base,
      people: applyDeletedPeople(mergePeopleUnion(base.people, backupPeople), deletedPersonIds)
    };
  }
  try {
    const parsed = { ...cloneSeed(), ...(JSON.parse(raw) as CareState), mode: "demo" as const };
    const deletedPersonIds = parsed.deletedPersonIds || [];
    return {
      ...parsed,
      deletedPersonIds,
      people: applyDeletedPeople(mergePeopleUnion(parsed.people, backupPeople), deletedPersonIds),
      places: mergePlaces(parsed.places, cloneSeed().places)
    };
  } catch {
    const base = cloneSeed();
    return {
      ...base,
      people: applyDeletedPeople(mergePeopleUnion(base.people, backupPeople), base.deletedPersonIds || [])
    };
  }
}

function loadBackedUpPeople(): PersonProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PEOPLE_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as PersonProfile[]) : [];
  } catch {
    return [];
  }
}

function backupEnrolledPeople(state: CareState) {
  if (typeof window === "undefined") return;
  const blocked = new Set(state.deletedPersonIds || []);
  const embeddedPeople = state.people.filter(
    (person) => person.face_embedding?.length && !blocked.has(person.id)
  );
  window.localStorage.setItem(PEOPLE_BACKUP_KEY, JSON.stringify(embeddedPeople));
}

/** Local/offline boot: union by id, prefer newer embeddings. */
function mergePeopleUnion(primary: PersonProfile[] = [], secondary: PersonProfile[] = []) {
  const people = new Map<string, PersonProfile>();
  for (const person of primary) people.set(person.id, person);
  for (const person of secondary) {
    const existing = people.get(person.id);
    if (!existing) {
      people.set(person.id, person);
      continue;
    }
    const shouldPreferSecondary =
      Boolean(person.face_embedding?.length && !existing.face_embedding?.length) ||
      Boolean(
        person.face_embedding_updated_at &&
          existing.face_embedding_updated_at &&
          person.face_embedding_updated_at > existing.face_embedding_updated_at
      );
    people.set(person.id, shouldPreferSecondary ? { ...existing, ...person } : existing);
  }
  return Array.from(people.values());
}

/**
 * Overlay embeddings/photos from local onto remote membership.
 * Remote people list is source of truth — local-only profiles are NOT re-added
 * (that was resurrecting deleted enrollments into Firebase).
 */
function mergePeopleRemoteAuthority(remote: PersonProfile[] = [], local: PersonProfile[] = []) {
  const localById = new Map(local.map((person) => [person.id, person]));
  return remote.map((person) => {
    const localPerson = localById.get(person.id);
    if (!localPerson) return person;
    const shouldPreferLocalEmbedding =
      Boolean(localPerson.face_embedding?.length && !person.face_embedding?.length) ||
      Boolean(
        localPerson.face_embedding?.length &&
          person.face_embedding?.length &&
          localPerson.face_embedding_updated_at &&
          person.face_embedding_updated_at &&
          localPerson.face_embedding_updated_at > person.face_embedding_updated_at
      );
    if (!shouldPreferLocalEmbedding) {
      if (localPerson.profile_photo_url && !person.profile_photo_url) {
        return { ...person, profile_photo_url: localPerson.profile_photo_url };
      }
      return person;
    }
    return {
      ...person,
      face_embedding: localPerson.face_embedding,
      face_embedding_model: localPerson.face_embedding_model ?? person.face_embedding_model,
      face_embedding_updated_at: localPerson.face_embedding_updated_at ?? person.face_embedding_updated_at,
      face_samples: localPerson.face_samples ?? person.face_samples,
      profile_photo_url: localPerson.profile_photo_url || person.profile_photo_url
    };
  });
}

function mergeDeletedIds(remote: string[] = [], local: string[] = []) {
  return Array.from(new Set([...remote, ...local].filter(Boolean)));
}

function applyDeletedPeople(people: PersonProfile[] = [], deletedIds: string[] = []) {
  if (!deletedIds.length) return people;
  const blocked = new Set(deletedIds);
  return people.filter((person) => !blocked.has(person.id));
}

function mergeRemoteWithLocal(remote: CareState, local: CareState): CareState {
  const deletedPersonIds = mergeDeletedIds(remote.deletedPersonIds, local.deletedPersonIds);
  const people = applyDeletedPeople(
    mergePeopleRemoteAuthority(remote.people || [], local.people || []),
    deletedPersonIds
  );
  return {
    ...cloneSeed("firebase"),
    ...remote,
    mode: "firebase",
    deletedPersonIds,
    people,
    places: mergePlaces(remote.places || [], cloneSeed("firebase").places),
    latestMobileFrame: remote.latestMobileFrame || local.latestMobileFrame,
    latestCaptureCommand: remote.latestCaptureCommand || local.latestCaptureCommand,
    latestLocation: remote.latestLocation || local.latestLocation,
    latestHealthSnapshot: remote.latestHealthSnapshot || local.latestHealthSnapshot,
    latestWatchCue: remote.latestWatchCue || local.latestWatchCue,
    wearEvents: remote.wearEvents?.length ? remote.wearEvents : local.wearEvents || []
  };
}

function mergePlaces(primary = seedState.places, fallback = seedState.places) {
  const seeds = new Map(fallback.map((place) => [place.id, place]));
  return primary.map((place) => {
    const seed = seeds.get(place.id);
    return {
      ...seed,
      ...place,
      latitude: place.latitude ?? seed?.latitude,
      longitude: place.longitude ?? seed?.longitude,
      risk_radius_m: place.risk_radius_m ?? seed?.risk_radius_m
    };
  });
}

/** Only true when a person already on remote is missing an embedding that local/merged has. Never used to re-create deleted people. */
function hasLocalEmbeddedPeopleMissing(remote: CareState, merged: CareState) {
  const mergedById = new Map((merged.people || []).map((person) => [person.id, person]));
  return (remote.people || []).some((person) => {
    if (person.face_embedding?.length) return false;
    const localMatch = mergedById.get(person.id);
    return Boolean(localMatch?.face_embedding?.length);
  });
}

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

function earnBadge(state: CareState, badge: Omit<CareBadge, "earned_at"> & { earned_at?: string }): CareState {
  const existing = state.careBadges || [];
  if (existing.some((item) => item.id === badge.id)) return state;
  return {
    ...state,
    careBadges: [
      { ...badge, earned_at: badge.earned_at || new Date().toISOString() },
      ...existing
    ]
  };
}

function applyCareActivity(
  state: CareState,
  input: {
    points: number;
    reason: string;
    source: "carelearn" | "carecircle" | "checkin" | "badge" | "streak" | "demo";
    badge?: Omit<CareBadge, "earned_at">;
  }
): CareState {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const last = state.lastCareActivityAt?.slice(0, 10);
  let streak = state.careStreakDays || 0;
  if (last === today) {
    // same day — keep streak
  } else if (last) {
    const prev = new Date(last);
    const diffDays = Math.round((now.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
    streak = diffDays === 1 ? streak + 1 : 1;
  } else {
    streak = 1;
  }

  let next: CareState = {
    ...state,
    rewardPoints: (state.rewardPoints ?? 0) + input.points,
    rewardTransactions: [
      {
        id: uid("reward"),
        patient_id: DEMO_PATIENT_ID,
        points: input.points,
        reason: input.reason,
        source: input.source,
        created_at: now.toISOString()
      },
      ...(state.rewardTransactions || [])
    ],
    careStreakDays: streak,
    lastCareActivityAt: now.toISOString()
  };

  if (input.badge) next = earnBadge(next, input.badge);
  if (streak >= 3) {
    next = earnBadge(next, {
      id: "badge_streak_3",
      title: "3-day care streak",
      description: "Stayed active in CareGrid for 3 days."
    });
  }
  if (streak >= 7) {
    next = earnBadge(next, {
      id: "badge_streak_7",
      title: "Week of care",
      description: "7-day care activity streak."
    });
  }
  return next;
}

function mainFirestoreState(state: CareState) {
  const { latestMobileFrame: _latestMobileFrame, ...rest } = state;
  return stripUndefined({ ...rest, mode: "firebase" });
}

export function CareStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CareState>(cloneSeed());
  const [isFirebase, setIsFirebase] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const skipNextFirebaseWrite = useRef(false);

  useEffect(() => {
    setState(loadLocalState());
    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(CHANNEL_KEY);
      channelRef.current.onmessage = (event: MessageEvent<CareState>) => {
        skipNextFirebaseWrite.current = true;
        setState(event.data);
      };
    }
    return () => channelRef.current?.close();
  }, []);

  useEffect(() => {
    // Phone WebView: long defer + one-shot getDoc (no realtime flood). Desktop: onSnapshot after short delay.
    let unsub: (() => void) | undefined;
    let cancelled = false;
    const isPhoneWebView =
      typeof navigator !== "undefined" && /RememberMeCareGridMobile/i.test(navigator.userAgent || "");
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    // Guard does not need Firestore for buttons/camera — skip attach entirely on that route.
    const skipFirebaseOnRoute = isPhoneWebView && path.startsWith("/memory-capture");
    const delayMs = isPhoneWebView ? 4000 : 1200;

    const applyRemote = (remote: CareState) => {
      const merged = mergeRemoteWithLocal(remote, loadLocalState());
      backupEnrolledPeople(merged);
      skipNextFirebaseWrite.current = true;
      setState(merged);
      return merged;
    };

    const needsPeopleCleanup = (remote: CareState, merged: CareState) => {
      const blocked = new Set(merged.deletedPersonIds || remote.deletedPersonIds || []);
      if (!blocked.size) return false;
      return (remote.people || []).some((person) => blocked.has(person.id));
    };

    const start = () => {
      if (cancelled || skipFirebaseOnRoute) return;
      const db = getFirebaseDb();
      if (!db) return;
      const ref = doc(db, ...FIREBASE_DOC);

      const maybeWriteFirebase = (remote: CareState, merged: CareState) => {
        // 1) Push missing embeddings for people that still exist on remote.
        // 2) Strip tombstoned people if an old tab re-added them.
        if (!hasLocalEmbeddedPeopleMissing(remote, merged) && !needsPeopleCleanup(remote, merged)) return;
        void setDoc(ref, mainFirestoreState(merged) as Record<string, unknown>, { merge: true }).catch((error) =>
          console.error("Firebase sync write failed", error)
        );
      };

      getDoc(ref)
        .then((snapshot) => {
          if (cancelled) return;
          setIsFirebase(true);
          if (!snapshot.exists()) {
            void setDoc(ref, cloneSeed("firebase"), { merge: true }).catch((error) => {
              console.error("Firebase seed write failed", error);
              setIsFirebase(false);
            });
            return;
          }
          const remote = snapshot.data() as CareState;
          const merged = applyRemote(remote);
          maybeWriteFirebase(remote, merged);
        })
        .catch((error) => {
          console.error("Firebase connection failed", error);
          setIsFirebase(false);
        });

      // Continuous listener only on desktop browsers — keeps phone main thread free.
      if (!isPhoneWebView) {
        unsub = onSnapshot(
          ref,
          (snapshot) => {
            setIsFirebase(true);
            if (!snapshot.exists()) return;
            const remote = snapshot.data() as CareState;
            const merged = applyRemote(remote);
            maybeWriteFirebase(remote, merged);
          },
          (error) => {
            console.error("Firebase realtime listener failed", error);
            setIsFirebase(false);
          }
        );
      }
    };

    const timer = window.setTimeout(start, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsub?.();
    };
  }, []);

  const persist = useCallback((nextState: CareState) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextState, mode: "demo" }));
      backupEnrolledPeople(nextState);
      channelRef.current?.postMessage({ ...nextState, mode: "demo" });
    }
    const db = getFirebaseDb();
    if (db && firebaseConfigured && !skipNextFirebaseWrite.current) {
      try {
        void setDoc(doc(db, ...FIREBASE_DOC), mainFirestoreState(nextState) as Record<string, unknown>, { merge: true }).catch(
          (error) => console.error("Firebase write failed", error)
        );
      } catch (error) {
        console.error("Firebase write failed", error);
      }
    }
    skipNextFirebaseWrite.current = false;
  }, []);

  const commit = useCallback<Committer>(
    (updater, label) => {
      setState((current) => {
        const nextState = updater(current);
        persist(nextState);
        if (label) toast.success(label);
        return nextState;
      });
    },
    [persist]
  );

  const value = useMemo<CareStoreValue>(() => {
    const addMemoryEvent = (event: MemoryEvent) =>
      commit(
        (current) => ({
          ...current,
          memoryEvents: [event, ...current.memoryEvents]
        }),
        "Memory timeline updated"
      );

    const updatePerson = (id: string, patch: Partial<PersonProfile>) =>
      commit((current) => ({
        ...current,
        people: current.people.map((person) => (person.id === id ? { ...person, ...patch } : person))
      }));

    const removePerson = (id: string) =>
      commit(
        (current) => ({
          ...current,
          people: current.people.filter((person) => person.id !== id),
          deletedPersonIds: Array.from(new Set([...(current.deletedPersonIds || []), id]))
        }),
        "Trusted profile removed"
      );

    const createAlert = (alert: Alert) =>
      commit(
        (current) => ({
          ...current,
          alerts: [alert, ...current.alerts]
        }),
        "Caregiver alert created"
      );

    const resolveAlert = (alertId: string) =>
      commit(
        (current) => ({
          ...current,
          alerts: current.alerts.map((alert) =>
            alert.id === alertId
              ? { ...alert, status: "resolved", resolved_at: new Date().toISOString() }
              : alert
          )
        }),
        "Alert resolved"
      );

    const createTask = (task: CommunityTask) =>
      commit(
        (current) => ({
          ...current,
          communityTasks: [task, ...current.communityTasks]
        }),
        "CareCircle task created"
      );

    const updateTask = (taskId: string, status: CommunityTask["status"]) =>
      commit(
        (current) => {
          const nextTasks = current.communityTasks.map((task) =>
            task.id === taskId
              ? { ...task, status, completed_at: status === "completed" ? new Date().toISOString() : task.completed_at }
              : task
          );
          if (status !== "completed" && status !== "reached" && status !== "accepted") {
            return { ...current, communityTasks: nextTasks };
          }
          const points = status === "completed" ? 80 : status === "reached" ? 40 : 25;
          const withRewards = applyCareActivity(current, {
            points,
            reason: `CareCircle task ${status}`,
            source: "carecircle",
            badge:
              status === "completed"
                ? {
                    id: "badge_carecircle_complete",
                    title: "CareCircle finisher",
                    description: "Marked a community help task as completed."
                  }
                : undefined
          });
          return { ...withRewards, communityTasks: nextTasks };
        },
        `Task marked ${status}`
      );

    const addTraining = (training: CareLearnTraining) =>
      commit(
        (current) => {
          const withRewards = applyCareActivity(current, {
            points: 120,
            reason: `${training.completed_by} completed ${training.role} CareLearn training.`,
            source: "carelearn",
            badge: {
              id: "badge_first_carelearn",
              title: "CareLearn trained",
              description: "Completed a Gemini CareLearn lesson for the care circle."
            }
          });
          const trainCount = withRewards.careLearnTrainings.length + 1;
          const multiBadge =
            trainCount >= 3
              ? earnBadge(withRewards, {
                  id: "badge_carelearn_3",
                  title: "CareLearn mentor",
                  description: "Completed 3 CareLearn trainings."
                })
              : withRewards;
          return {
            ...multiBadge,
            careLearnTrainings: [training, ...multiBadge.careLearnTrainings],
            memoryEvents: [
              {
                id: uid("event_training"),
                patient_id: DEMO_PATIENT_ID,
                event_type: "carelearn_training_completed",
                timestamp: training.completed_at,
                source: "carelearn",
                location: "CareLearn",
                people_involved: [training.completed_by],
                summary: `${training.completed_by} completed ${training.role} CareLearn training.`,
                risk_score: 0,
                privacy_level: "care_circle",
                retention_policy: "saved",
                action_items: ["Keep role training refreshed after future incidents."]
              },
              ...multiBadge.memoryEvents
            ]
          };
        },
        "CareLearn training completed"
      );

    const addDoctorReport = (report: DoctorReport) =>
      commit(
        (current) => ({
          ...current,
          doctorReports: [report, ...current.doctorReports]
        }),
        "Doctor brief generated"
      );

    const setLatestMobileFrame = (frame: MobileFrame) => {
      setState((current) => {
        const nextState = { ...current, latestMobileFrame: frame };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextState, mode: "demo" }));
        }
        return nextState;
      });
      toast.success("Phone camera frame received");
    };

    const setLatestLocation = (location: LatestLocation) =>
      commit((current) => ({ ...current, latestLocation: location }), "Latest location updated");

    const setLatestHealthSnapshot = (snapshot: HealthSnapshot) =>
      commit((current) => ({ ...current, latestHealthSnapshot: snapshot }), "Wearable health synced");

    const setLatestWatchCue = (cue: WatchCue) => {
      void saveLiveWatchCue(cue);
      commit((current) => ({ ...current, latestWatchCue: cue }), "Lumo cue sent to watch");
    };

    const addWearEvent = (event: WearEvent) =>
      commit(
        (current) => ({
          ...current,
          wearEvents: [event, ...current.wearEvents],
          latestLocation:
            event.latitude && event.longitude
              ? {
                  patient_id: event.patient_id,
                  latitude: event.latitude,
                  longitude: event.longitude,
                  captured_at: event.timestamp,
                  source: "wearos"
                }
              : current.latestLocation
        }),
        "Wear OS event logged"
      );

    const runLakshmiConversation = (summary: ConversationSummary, transcript: string) => {
      const timestamp = new Date().toISOString();
      const event: MemoryEvent = {
        id: uid("event_conversation"),
        patient_id: DEMO_PATIENT_ID,
        event_type: "conversation",
        timestamp,
        source: "voice",
        location: "Ramaiah temple gate",
        people_involved: ["Lakshmi"],
        summary: summary.summary,
        raw_transcript: transcript,
        risk_score: 4,
        privacy_level: "care_circle",
        retention_policy: "saved",
        action_items: [summary.action_item]
      };
      commit(
        (current) => ({
          ...current,
          memoryEvents: [event, ...current.memoryEvents],
          people: current.people.map((person) =>
            person.id === "person_lakshmi"
              ? {
                  ...person,
                  last_seen_at: timestamp,
                  last_seen_location: "Ramaiah temple gate",
                  last_conversation_summary: summary.summary
                }
              : person
          )
        }),
        "Lakshmi conversation saved"
      );
    };

    const runMemoryJournal = (
      journal: {
        memory_topic: string;
        emotion: string;
        people: string[];
        location: string;
        summary: string;
        future_conversation_starter: string;
      },
      transcript: string
    ) => {
      const event: MemoryEvent = {
        id: uid("event_journal"),
        patient_id: DEMO_PATIENT_ID,
        event_type: "memory_journal",
        timestamp: new Date().toISOString(),
        source: "voice",
        location: journal.location || "Home",
        people_involved: journal.people.length ? journal.people : ["Rajamma"],
        summary: journal.summary,
        raw_transcript: transcript,
        risk_score: 2,
        privacy_level: "caregiver_only",
        retention_policy: "saved",
        action_items: [journal.future_conversation_starter]
      };
      addMemoryEvent(event);
    };

    const simulateWandering = () => {
      const timestamp = new Date().toISOString();
      const event: MemoryEvent = {
        id: uid("event_wander"),
        patient_id: DEMO_PATIENT_ID,
        event_type: "safe_zone_exit",
        timestamp,
        source: "gps",
        location: "MSRIT gate, 520m from home",
        people_involved: ["Rajamma"],
        summary: "Rajamma left the safe zone near MSRIT gate. Nearest safe point is Lakshmi, 120m away.",
        risk_score: 78,
        privacy_level: "emergency",
        retention_policy: "72_hours",
        action_items: ["Contact Ananya.", "Notify Lakshmi if available.", "Ask patient to wait near the shop."]
      };
      const alert: Alert = {
        id: uid("alert_wander"),
        patient_id: DEMO_PATIENT_ID,
        alert_type: "safe_zone_exit",
        severity: "high",
        message:
          "Rajamma left the safe zone at 11:42 AM. Last known location near MSRIT gate. Nearest safe point is Lakshmi neighbour, 120m away.",
        recipients: ["caregiver", "neighbour", "rwa"],
        status: "pending",
        created_at: timestamp,
        linked_memory_event_id: event.id
      };
      const task: CommunityTask = {
        id: uid("task_neighbour"),
        patient_id: DEMO_PATIENT_ID,
        alert_id: alert.id,
        assigned_role: "neighbour",
        assigned_to: "Lakshmi",
        task_title: "Check on Rajamma near temple gate",
        task_steps: [
          "Speak slowly and calmly.",
          "Do not argue or ask many questions.",
          "Keep Rajamma away from traffic.",
          "Tap reached, then wait for caregiver confirmation."
        ],
        status: "pending",
        created_at: timestamp
      };
      commit(
        (current) => ({
          ...current,
          memoryEvents: [event, ...current.memoryEvents],
          alerts: [alert, ...current.alerts],
          communityTasks: [task, ...current.communityTasks]
        }),
        "SafePath alert and CareCircle task created"
      );
      return { alert, task, event };
    };

    const markNeighbourTrained = (card: TrainingCard) => {
      addTraining({
        id: uid("training"),
        patient_id: DEMO_PATIENT_ID,
        role: "neighbour",
        resource_ids: ["carelearn_wandering_001", "carelearn_communication_001"],
        generated_card: card.role_specific_card,
        quiz_score: 5,
        completed_by: "Lakshmi",
        completed_at: new Date().toISOString(),
        event_context: "Safe zone exit near MSRIT gate"
      });
    };

    return {
      state,
      isFirebase,
      resetDemo: () =>
        commit(() => cloneSeed(isFirebase ? "firebase" : "demo"), "Demo state reset"),
      commit,
      addMemoryEvent,
      updatePerson,
      removePerson,
      createAlert,
      resolveAlert,
      createTask,
      updateTask,
      addTraining,
      addDoctorReport,
      setLatestMobileFrame,
      setLatestLocation,
      setLatestHealthSnapshot,
      setLatestWatchCue,
      addWearEvent,
      runLakshmiConversation,
      runMemoryJournal,
      simulateWandering,
      markNeighbourTrained
    };
  }, [commit, isFirebase, state]);

  return <CareStoreContext.Provider value={value}>{children}</CareStoreContext.Provider>;
}

export function useCareStore() {
  const value = useContext(CareStoreContext);
  if (!value) throw new Error("useCareStore must be used inside CareStoreProvider");
  return value;
}
