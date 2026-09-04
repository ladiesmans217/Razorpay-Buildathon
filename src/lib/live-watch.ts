"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import type { WatchCue } from "@/lib/types";
import { firebaseConfigured, getFirebaseDb } from "@/lib/firebase";

const LIVE_WATCH_CUE_DOC = ["watchCues", "latest"] as const;

export async function saveLiveWatchCue(cue: WatchCue) {
  const db = getFirebaseDb();
  if (!db || !firebaseConfigured) return false;
  try {
    await setDoc(doc(db, ...LIVE_WATCH_CUE_DOC), stripUndefined(cue));
    return true;
  } catch (error) {
    console.error("Live watch cue Firebase write failed", error);
    return false;
  }
}

export function subscribeLiveWatchCue(onCue: (cue: WatchCue) => void) {
  const db = getFirebaseDb();
  if (!db || !firebaseConfigured) return () => undefined;
  return onSnapshot(
    doc(db, ...LIVE_WATCH_CUE_DOC),
    (snapshot) => {
      if (snapshot.exists()) onCue(snapshot.data() as WatchCue);
    },
    (error) => console.error("Live watch cue listener failed", error)
  );
}

function stripUndefined(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as Record<string, unknown>;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, item && typeof item === "object" ? stripUndefined(item) : item])
    );
  }
  return value as Record<string, unknown>;
}
