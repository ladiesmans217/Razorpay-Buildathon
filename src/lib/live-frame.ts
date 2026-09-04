"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import type { MobileFrame } from "@/lib/types";
import { firebaseConfigured, getFirebaseDb } from "@/lib/firebase";

const LOCAL_FRAME_KEY = "rememberme-caregrid-latest-mobile-frame-v1";
const LIVE_FRAME_DOC = ["liveFrames", "latestMobileFrame"] as const;

export async function saveLatestMobileFrame(frame: MobileFrame) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_FRAME_KEY, JSON.stringify(frame));
  }
  const db = getFirebaseDb();
  if (db && firebaseConfigured) {
    try {
      await setDoc(doc(db, ...LIVE_FRAME_DOC), stripUndefined(frame));
      return true;
    } catch (error) {
      console.error("Live frame Firebase write failed", error);
      return false;
    }
  }
  return false;
}

export function loadLatestMobileFrame() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_FRAME_KEY);
    return raw ? (JSON.parse(raw) as MobileFrame) : null;
  } catch {
    return null;
  }
}

export function subscribeLatestMobileFrame(onFrame: (frame: MobileFrame) => void) {
  const db = getFirebaseDb();
  if (!db || !firebaseConfigured) return () => undefined;
  return onSnapshot(
    doc(db, ...LIVE_FRAME_DOC),
    (snapshot) => {
      if (snapshot.exists()) onFrame(snapshot.data() as MobileFrame);
    },
    (error) => console.error("Live frame listener failed", error)
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
