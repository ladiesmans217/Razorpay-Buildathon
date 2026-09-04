"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Camera, Loader2, Mic, RefreshCcw, ShieldCheck, StopCircle } from "lucide-react";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import type { CaptureCommand, CaptureSession, WatchCue } from "@/lib/types";
import { uid } from "@/lib/utils";

declare global {
  interface Window {
    CareGridNative?: {
      log?: (message: string) => void;
      startSpeech?: (prompt?: string) => void;
    };
  }
}

type NativeLogEvent = CustomEvent<string>;
type NativeSpeechEvent = CustomEvent<{ transcript?: string; error?: string }>;
type LogLine = { id: string; text: string };

const MEDIA_TIMEOUT_MS = 12000;

export default function MemoryCapturePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const commandSeenRef = useRef<string | null>(null);
  const cameraOnRef = useRef(false);
  const sessionRef = useRef<CaptureSession | null>(null);
  const tapCountRef = useRef(0);
  const logSeqRef = useRef(0);
  const bootedRef = useRef(false);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [readyAt, setReadyAt] = useState<string | null>(null);
  const [jsAlive, setJsAlive] = useState(false);
  const [bootStuck, setBootStuck] = useState(false);
  const [status, setStatus] = useState("Guard page loaded. Waiting for client JS…");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [guardOn, setGuardOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [micOn, setMicOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [latestCommand, setLatestCommand] = useState<CaptureCommand | null>(null);
  const [latestSpeech, setLatestSpeech] = useState("");
  const [captureStage, setCaptureStage] = useState("Waiting for a watch or phone camera request.");
  const [lastFaceResult, setLastFaceResult] = useState<{ status: "matched" | "unknown" | "no_face"; label: string; detail: string } | null>(null);

  /** Local-only logging — unique ids so React keys never collide (Strict Mode double-mount). */
  const pushLog = useCallback((title: string, detail = title) => {
    logSeqRef.current += 1;
    const text = `${now()} - ${detail}`;
    const id = `log-${logSeqRef.current}-${Date.now()}`;
    setStatus(detail);
    setLogs((current) => [{ id, text }, ...current].slice(0, 10));
    console.log(`[CareGrid Guard] ${title}: ${detail}`);
    try {
      window.CareGridNative?.log?.(`${title}: ${detail}`);
    } catch {
      // native bridge optional
    }
  }, []);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
  }, [cameraOn]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // useLayoutEffect runs as soon as the client mounts — earlier than useEffect.
  useLayoutEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const stamp = now();
    setReadyAt(stamp);
    setJsAlive(true);
    setBootStuck(false);
    pushLog("JS ready", `JS ready at ${stamp}. Buttons are live.`);
  }, [pushLog]);

  useEffect(() => {
    if (jsAlive) return;
    const timer = window.setTimeout(() => setBootStuck(true), 8000);
    return () => window.clearTimeout(timer);
  }, [jsAlive]);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as NativeLogEvent).detail || "native event";
      pushLog("Native", detail);
    };
    const speechListener = (event: Event) => {
      void handleNativeSpeech(event as NativeSpeechEvent);
    };
    window.addEventListener("caregrid-native-log", listener);
    window.addEventListener("caregrid-native-speech", speechListener as EventListener);
    return () => {
      window.removeEventListener("caregrid-native-log", listener);
      window.removeEventListener("caregrid-native-speech", speechListener as EventListener);
      if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
      stopAllMedia(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushLog]);

  // Only poll watch commands while guard/relay is active — cuts idle network lag.
  useEffect(() => {
    if (!guardOn) return;
    void checkWatchCommand(false);
    const timer = setInterval(() => void checkWatchCommand(false), 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardOn]);

  const setBusySafe = (value: boolean) => {
    if (busyTimerRef.current) {
      clearTimeout(busyTimerRef.current);
      busyTimerRef.current = null;
    }
    setBusy(value);
    if (value) {
      // Never leave UI looking dead if getUserMedia hangs in WebView.
      busyTimerRef.current = setTimeout(() => {
        setBusy(false);
        pushLog("Timeout", "Camera/mic request timed out. Try Capture photo now, or allow permission and retry.");
      }, MEDIA_TIMEOUT_MS);
    }
  };

  const runAction = (label: string, fn: () => void | Promise<unknown>) => {
    // Instant status line feedback so WebView taps never feel dead.
    if (label !== "Tap test") pushLog(label, `${label}…`);
    try {
      const result = fn();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        void (result as Promise<unknown>).catch((error) => pushLog(`${label} error`, readableError(error)));
      }
    } catch (error) {
      pushLog(`${label} error`, readableError(error));
    }
  };

  const tapTest = () => {
    tapCountRef.current += 1;
    const next = tapCountRef.current;
    setTapCount(next);
    pushLog("Tap test", `Tap test worked ${next} time${next === 1 ? "" : "s"}. JS click handlers are alive.`);
  };

  const startMemoryGuard = () => {
    setGuardOn(true);
    pushLog("Guard", "Memory Guard is ON. Backend session starting in background.");
    void ensureSession("movement_speech_detected");
  };

  const startPhoneRelay = async () => {
    setGuardOn(true);
    pushLog("Relay", "Starting phone relay — requesting camera (allow when Android asks).");
    void ensureSession("movement_speech_detected");
    const cameraStarted = await startCamera();
    if (cameraStarted) void startMic();
  };

  const startCamera = async (options: { includeAudio?: boolean; facingMode?: "environment" | "user" } = {}) => {
    const facingMode = options.facingMode || cameraFacing;
    pushLog("Camera", options.includeAudio ? "Requesting camera + mic…" : "Requesting camera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      pushLog("Camera error", "getUserMedia unavailable in this WebView. Use Capture photo now.");
      return false;
    }
    setBusySafe(true);
    try {
      stopCameraOnly();
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 1280 }
          },
          audio: Boolean(options.includeAudio)
        }),
        MEDIA_TIMEOUT_MS - 500,
        "Camera permission / getUserMedia timed out"
      );
      setCameraFacing(facingMode);
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(stream.getVideoTracks().some((track) => track.readyState === "live"));
      setMicOn(stream.getAudioTracks().some((track) => track.readyState === "live"));
      pushLog("Camera", `Camera live. Video tracks: ${stream.getVideoTracks().length}.`);
      return true;
    } catch (error) {
      pushLog("Camera error", `${readableError(error)}. Use Capture photo now as fallback.`);
      return false;
    } finally {
      setBusySafe(false);
    }
  };

  const switchCamera = async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(nextFacing);
    pushLog("Camera", `Switched to ${nextFacing === "environment" ? "rear" : "selfie"} camera mode.`);
    if (cameraOnRef.current) {
      await startCamera({ facingMode: nextFacing });
    }
  };

  const startMic = async () => {
    pushLog("Mic", "Requesting microphone…");
    if (!navigator.mediaDevices?.getUserMedia) {
      pushLog("Mic fallback", "getUserMedia unavailable. Opening native speech input.");
      return startNativeSpeech();
    }
    setBusySafe(true);
    try {
      stopMicOnly();
      micStreamRef.current = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        }),
        MEDIA_TIMEOUT_MS - 500,
        "Mic permission timed out"
      );
      setMicOn(micStreamRef.current.getAudioTracks().some((track) => track.readyState === "live"));
      pushLog("Mic", `Microphone live. Tracks: ${micStreamRef.current.getAudioTracks().length}.`);
      return true;
    } catch (error) {
      const firstError = readableError(error);
      pushLog("Mic retry", `${firstError}. Retrying simple audio…`);
      stopCameraOnly();
      await sleep(250);
      try {
        micStreamRef.current = await withTimeout(
          navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          8000,
          "Mic retry timed out"
        );
        setMicOn(micStreamRef.current.getAudioTracks().some((track) => track.readyState === "live"));
        pushLog("Mic", `Microphone live after retry.`);
        return true;
      } catch (retryError) {
        pushLog("Mic fallback", `${readableError(retryError)}. Opening native Android speech.`);
        return startNativeSpeech();
      }
    } finally {
      setBusySafe(false);
    }
  };

  const startNativeSpeech = () => {
    if (!window.CareGridNative?.startSpeech) {
      pushLog("Native mic unavailable", "Native speech bridge missing. Use Capture photo now.");
      return false;
    }
    pushLog("Native mic", "Opening Android speech input…");
    window.CareGridNative.startSpeech("Speak a short memory note for Lumo");
    return true;
  };

  const handleNativeSpeech = async (event: NativeSpeechEvent) => {
    const detail = event.detail || {};
    if (detail.error) {
      pushLog("Native speech error", detail.error);
      return;
    }
    const transcript = (detail.transcript || "").trim();
    if (!transcript) {
      pushLog("Native speech", "No speech text returned.");
      return;
    }
    setLatestSpeech(transcript);
    pushLog("Native speech", `Captured: "${transcript}". Sending speech candidate.`);
    await sendSpeechCandidate(transcript);
  };

  const sendSpeechCandidate = async (snippet: string) => {
    const activeSession = sessionRef.current || (await ensureSession("movement_speech_detected"));
    const location = activeSession?.location || (await readLocation());
    try {
      const response = await fetch("/api/capture/speech-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: DEMO_PATIENT_ID,
          session_id: activeSession?.id,
          snippet,
          source_device: "android_phone",
          location
        })
      }).then((res) => res.json());
      pushLog(
        "Speech candidate",
        response.should_prompt
          ? `Lumo prompt created: ${response.classification?.classification || "meaningful speech"}.`
          : `Speech ignored safely: ${response.classification?.classification || "not meaningful"}.`
      );
    } catch (error) {
      pushLog("Speech candidate error", readableError(error));
    }
  };

  const captureFromLiveCamera = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      pushLog("Capture", "Live camera frame is not ready. Use Capture photo now.");
      return;
    }
    setCaptureStage("Frame captured from live camera. Preparing image...");
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      pushLog("Capture error", "Could not create camera canvas.");
      return;
    }
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    await processPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.68), latestCommand || undefined);
  };

  const captureFallbackPhoto = async (file?: File | null) => {
    if (!file) {
      pushLog("Native capture", "No photo returned from Android camera/gallery.");
      return;
    }
    setCaptureStage("Photo selected. Preparing image...");
    pushLog("Native capture", `Photo returned: ${file.name || "camera image"}. Processing now.`);
    await processPhotoDataUrl(await fileToDataUrl(file), latestCommand || undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processPhotoDataUrl = async (dataUrl: string, command?: CaptureCommand) => {
    setBusySafe(true);
    setLastFaceResult(null);
    setCaptureStage("Compressing photo…");
    pushLog("Photo", "Frame captured. Matching with enrolled embeddings (same Human model as Enroll).");
    try {
      // Never reuse ambient movement session for who-is-this (that caused photo-consent errors).
      const activeSession = await ensureIdentitySession(command);
      if (!activeSession) {
        pushLog("Photo error", "Could not create capture session.");
        setCaptureStage("Could not create capture session.");
        return;
      }

      const compactDataUrl = await compressDataUrl(dataUrl, 640, 0.7);
      setCaptureStage("Reading face embedding from frame…");

      let faceStatus: "matched" | "unknown" | "no_face" = "no_face";
      let cue: WatchCue;
      let resultLabel = "No clear face";
      let resultDetail = "Lumo could not clearly see a face.";
      try {
        let embedding: number[] | undefined;
        try {
          const { dataUrlToImage, extractFaceEmbedding } = await import("@/lib/vision/face");
          const image = await dataUrlToImage(compactDataUrl);
          const face = await extractFaceEmbedding(image);
          embedding = face.embedding;
          pushLog("Embedding", `Extracted ${embedding.length}D vector (same pipeline as Enroll).`);
        } catch (extractError) {
          pushLog("Embedding", `On-device extract failed (${readableError(extractError)}). Falling back to server vision.`);
        }

        setCaptureStage(embedding?.length ? "Comparing embedding on CareGrid server…" : "Matching on CareGrid server…");
        const recognized = await fetch("/api/recognize-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data_url: compactDataUrl,
            embedding,
            patient_id: DEMO_PATIENT_ID
          })
        }).then(async (res) => {
          const json = await res.json();
          if (!res.ok && !json.status) throw new Error(json.error || `HTTP ${res.status}`);
          return json as {
            status?: "matched" | "unknown" | "no_face";
            label?: string;
            detail?: string;
            cue?: string;
            person?: { name?: string; relation?: string; last_conversation_summary?: string } | null;
            method?: string;
            roster_with_embeddings?: number;
            similarity?: number | null;
          };
        });

        faceStatus = recognized.status || "no_face";
        resultLabel =
          recognized.label ||
          (faceStatus === "matched" ? "Trusted person" : faceStatus === "unknown" ? "Unknown person" : "No clear face");
        resultDetail = recognized.detail || resultDetail;
        if (faceStatus === "matched" && recognized.person?.name) {
          cue = {
            id: uid("watch_cue_guard_match"),
            patient_id: DEMO_PATIENT_ID,
            cue:
              recognized.cue ||
              `This is ${recognized.person.name}. ${recognized.person.relation || ""}. ${recognized.person.last_conversation_summary || ""}`,
            source_event: "person_recognition",
            created_at: new Date().toISOString(),
            person_name: recognized.person.name,
            relation: recognized.person.relation,
            should_vibrate: true,
            speak_mode: "native_tts"
          };
        } else if (faceStatus === "unknown") {
          cue = unknownCue();
          if (recognized.cue) cue = { ...cue, cue: recognized.cue };
        } else {
          cue = {
            id: uid("watch_cue_guard_no_face"),
            patient_id: DEMO_PATIENT_ID,
            cue:
              recognized.cue ||
              "I could not clearly see a face. Please point the CareGrid phone camera again or use Capture photo now.",
            source_event: "capture",
            created_at: new Date().toISOString(),
            should_vibrate: false,
            speak_mode: "native_tts"
          };
        }
        const embCount =
          typeof recognized.roster_with_embeddings === "number" ? ` roster_emb=${recognized.roster_with_embeddings}` : "";
        const sim =
          typeof recognized.similarity === "number" ? ` sim=${recognized.similarity.toFixed(3)}` : "";
        pushLog("Face match", `${faceStatus} via ${recognized.method || "server"}${sim}${embCount}: ${resultLabel}`);
      } catch (error) {
        faceStatus = "no_face";
        resultLabel = "No clear face";
        resultDetail = "Please point the camera again or use Capture photo now.";
        cue = {
          id: uid("watch_cue_guard_no_face"),
          patient_id: DEMO_PATIENT_ID,
          cue: "I could not clearly see a face. Please point the CareGrid phone camera again or use Capture photo now.",
          source_event: "capture",
          created_at: new Date().toISOString(),
          should_vibrate: false,
          speak_mode: "native_tts"
        };
        pushLog("Face matcher", readableError(error));
      }

      setLastFaceResult({ status: faceStatus, label: resultLabel, detail: resultDetail });
      setCaptureStage(
        faceStatus === "matched"
          ? `Recognized ${resultLabel}. Saving event and sending cue to watch...`
          : `${resultLabel}. Sending cue to watch...`
      );

      // Identity answer must reach the watch even if media save fails.
      try {
        await fetch("/api/watch/cue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cue)
        });
        pushLog("Watch cue", `Published: ${resultLabel}`);
      } catch (cueError) {
        pushLog("Watch cue error", readableError(cueError));
      }

      const saved = await fetch("/api/capture/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: activeSession.id,
          command_id: command?.id,
          data_url: compactDataUrl,
          // Always front-ID on Guard — ambient photo consent does not apply.
          front_identification: true,
          face_status: faceStatus,
          result_cue_id: cue.id,
          skip_watch_cue: true,
          source_device: "android_phone",
          location: activeSession.location
        })
      }).then((res) => res.json());
      if (!saved.ok) {
        setCaptureStage(`Cue sent (${resultLabel}). Media save note: ${saved.error || "unknown error"}.`);
        pushLog("Photo", `Watch cue sent. Media save failed: ${saved.error || "unknown"}.`);
      } else {
        setCaptureStage(`Done. ${resultLabel} cue sent to the watch.`);
        pushLog("Photo", `Done. ${resultLabel}. Watch cue + media save ok.`);
      }
      if (command) await checkWatchCommand(true);
    } catch (error) {
      pushLog("Photo error", readableError(error));
      setCaptureStage(`Photo processing failed: ${readableError(error)}.`);
    } finally {
      setBusySafe(false);
    }
  };

  /** Prefer server who-is-this session; never reuse ambient movement session for identity. */
  const ensureIdentitySession = async (command?: CaptureCommand | null) => {
    const existing = sessionRef.current;
    if (existing && existing.trigger === "manual_who_is_this" && !["saved", "declined", "cancelled"].includes(existing.status)) {
      return existing;
    }
    if (command?.session_id) {
      // Keep local ref aligned if watch already opened a session id.
      return ensureSession("manual_who_is_this", { forceNewIfWrongTrigger: true, preferredSessionId: command.session_id });
    }
    return ensureSession("manual_who_is_this", { forceNewIfWrongTrigger: true });
  };

  const ensureSession = async (
    trigger: CaptureSession["trigger"],
    options?: { forceNewIfWrongTrigger?: boolean; preferredSessionId?: string }
  ) => {
    const existing = sessionRef.current;
    if (
      existing &&
      !["saved", "declined", "cancelled"].includes(existing.status) &&
      (!options?.forceNewIfWrongTrigger || existing.trigger === trigger)
    ) {
      return existing;
    }
    try {
      const location = await Promise.race([
        readLocation(),
        new Promise<CaptureSession["location"]>((resolve) => setTimeout(() => resolve(undefined), 900))
      ]);
      const response = await fetch("/api/capture/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: DEMO_PATIENT_ID,
          trigger,
          status: trigger === "manual_who_is_this" ? "speech_candidate" : "movement_detected",
          source_device: "android_phone",
          movement_source: "manual",
          location,
          // Front-ID sessions include photo consent so ambient gate never blocks.
          consent:
            trigger === "manual_who_is_this"
              ? { name: false, photo: true, transcript: false }
              : undefined
        })
      }).then((res) => res.json());
      if (response.session) {
        setSession(response.session);
        sessionRef.current = response.session;
        pushLog("Session", `Backend session ready: ${response.session.trigger || trigger} / ${response.session.status}.`);
        return response.session as CaptureSession;
      }
      pushLog("Session error", response.error || "No session returned.");
    } catch (error) {
      pushLog("Session error", readableError(error));
    }
    return null;
  };

  const checkWatchCommand = async (manual: boolean) => {
    try {
      const response = await fetch("/api/capture/command/latest", { cache: "no-store" }).then((res) => res.json());
      const command = response.command as CaptureCommand | null;
      setLatestCommand(command);
      if (!command || command.status !== "pending") {
        if (manual) pushLog("Command", "No pending watch camera command.");
        return;
      }
      if (commandSeenRef.current === command.id && !manual) return;
      commandSeenRef.current = command.id;
      setGuardOn(true);
      pushLog("Command", "Watch requested a front-person frame. Start Camera or use Capture photo now.");
    if (cameraOnRef.current) await captureFromLiveCamera();
    } catch (error) {
      if (manual) pushLog("Command error", readableError(error));
    }
  };

  const stopAllMedia = (visible = true) => {
    stopCameraOnly();
    stopMicOnly();
    if (visible) pushLog("Media", "Camera and microphone stopped.");
  };

  const stopCameraOnly = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    cameraOnRef.current = false;
    setCameraOn(false);
  };

  const stopMicOnly = () => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    setMicOn(false);
  };

  return (
    <main className="min-h-screen bg-[#f7f3eb] pb-28 text-[#24201c]">
      <header className="sticky top-0 z-30 border-b border-[#24201c]/10 bg-[#fffaf1]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#bc6f55]">CareGrid Guard</p>
            <h1 className="font-serif text-2xl font-bold leading-tight">Phone relay</h1>
          </div>
          <div className="rounded-full bg-[#fff4cf] px-3 py-1 text-xs font-black text-[#7b5a15]">300 pts</div>
        </div>
      </header>

      <section className="p-4">
        <div className="rounded-[28px] bg-[#24201c] p-4 text-[#fff8eb] shadow-xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#e9ba66]">First diagnostic line</p>
          <p className="mt-2 text-lg font-bold">
            {jsAlive && readyAt ? `JS ready at ${readyAt}` : "Loading client JS…"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#fff8eb]/72">
            {jsAlive
              ? "Handlers are live. Tap test should change the counter immediately."
              : bootStuck
                ? "Still waiting for client JS. Confirm npm run dev + ngrok, then Reload. First open over ngrok can be slow."
                : "Downloading Guard scripts… usually a few seconds on first open."}
          </p>
          {/* Plain <a> works even before React hydrates */}
          <a
            href="/memory-capture"
            className="mt-3 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full border-2 border-[#e9ba66]/50 bg-[#e9ba66]/20 px-4 text-sm font-extrabold text-[#fff1c2]"
          >
            Reload Guard page
          </a>
          {bootStuck && !jsAlive ? (
            <p className="mt-2 text-xs leading-5 text-[#fff8eb]/65">
              Tip: open the same ngrok URL once in Chrome, pass the interstitial, then reopen the app.
            </p>
          ) : null}
          {busy ? (
            <p className="mt-3 rounded-2xl bg-[#e9ba66]/20 px-3 py-2 text-xs font-bold text-[#fff1c2]">
              Waiting on camera/mic (auto-unlocks in a few seconds if stuck)…
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <Pill label={guardOn ? "Guard on" : "Guard off"} good={guardOn} />
          <Pill label={cameraOn ? "Camera live" : "Camera off"} good={cameraOn} />
          <Pill label={cameraFacing === "environment" ? "Rear cam" : "Selfie cam"} good />
          <Pill label={micOn ? "Mic live" : "Mic off"} good={micOn} />
        </div>

        <div className="mt-4 overflow-hidden rounded-[28px] bg-white/70 p-4 shadow-lg">
          <div className="relative aspect-[3/4] max-h-[54vh] w-full overflow-hidden rounded-[24px] bg-[#1f1c19]">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              disablePictureInPicture
              className={`h-full w-full object-cover ${cameraOn ? "opacity-100" : "pointer-events-none opacity-0"}`}
            />
            {!cameraOn ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-[#fff8eb]">
                <span className="grid size-14 place-items-center rounded-full bg-white/10">
                  <Camera size={28} />
                </span>
                <p className="text-base font-black">Camera off</p>
                <p className="text-sm font-semibold leading-5 text-[#fff8eb]/72">
                  Tap <span className="text-[#e9ba66]">Start phone relay</span> or <span className="text-[#e9ba66]">Start Camera</span>. Allow camera when Android asks.
                </p>
              </div>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void captureFallbackPhoto(event.target.files?.[0])}
          />

          <div className="mt-4 rounded-[22px] bg-[#6f8b78]/12 p-3 text-sm font-bold leading-6 text-[#476353]">
            {status}
          </div>
          <div className="mt-3 rounded-[22px] bg-[#24201c] p-3 text-[#fff8eb]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#e9ba66]">Phone relay result</p>
            <p className="mt-2 text-sm font-bold leading-6">{captureStage}</p>
            {lastFaceResult ? (
              <div className="mt-3 rounded-2xl bg-white/10 p-3">
                <p className="text-base font-black">{lastFaceResult.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#fff8eb]/75">{lastFaceResult.detail}</p>
              </div>
            ) : null}
          </div>
          {latestSpeech ? (
            <div className="mt-3 rounded-[22px] bg-[#fff4cf] p-3 text-sm font-bold leading-6 text-[#7b5a15]">
              Latest speech: “{latestSpeech}”
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            <button type="button" className={primaryHoneyBtn} onClick={() => runAction("Tap test", tapTest)}>
              Tap test ({tapCount})
            </button>
            <button
              type="button"
              className={primaryDarkBtn}
              onClick={() => runAction("Start phone relay", () => startPhoneRelay())}
            >
              {busy ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
              Start phone relay
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={secondaryBtn} onClick={() => runAction("Memory Guard", startMemoryGuard)}>
                <ShieldCheck size={17} />
                Start Memory Guard
              </button>
              <button type="button" className={secondaryBtn} onClick={() => runAction("Start Camera", () => startCamera())}>
                <Camera size={17} />
                Start Camera
              </button>
              <button type="button" className={secondaryBtn} onClick={() => runAction("Switch camera", () => switchCamera())}>
                <RefreshCcw size={17} />
                {cameraFacing === "environment" ? "Use Selfie" : "Use Rear"}
              </button>
              <button type="button" className={secondaryBtn} onClick={() => runAction("Start Mic", () => startMic())}>
                <Mic size={17} />
                Start Mic
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() =>
                  runAction("Capture photo", () => {
                    fileInputRef.current?.click();
                  })
                }
              >
                <Camera size={17} />
                Capture photo now
              </button>
              <button type="button" className={secondaryBtn} onClick={() => runAction("Check watch", () => checkWatchCommand(true))}>
                <RefreshCcw size={17} />
                Check watch command
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() =>
                  runAction("Stop relay", () => {
                    stopAllMedia();
                  })
                }
              >
                <StopCircle size={17} />
                Stop relay
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-[28px] bg-white/70 p-4 shadow-lg">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#bc6f55]">Action log</p>
          <div className="mt-3 space-y-2 text-xs leading-5 text-[#746b61]">
            {logs.length ? logs.map((line) => <p key={line.id}>{line.text}</p>) : <p>No events yet.</p>}
          </div>
        </div>

        <div className="mt-4 rounded-[28px] bg-white/70 p-4 text-sm leading-6 text-[#746b61] shadow-lg">
          <p><strong>Session:</strong> {session?.status || "none"}</p>
          <p><strong>Watch command:</strong> {latestCommand ? `${latestCommand.command} - ${latestCommand.status}` : "none"}</p>
          <p><strong>Reliable demo:</strong> If live camera hangs, use Capture photo now (always works).</p>
        </div>
      </section>

      <MobileTabBar activeHref="/memory-capture" />
    </main>
  );
}

const btnBase =
  "inline-flex min-h-12 touch-manipulation select-none items-center justify-center gap-2 rounded-full border-2 px-3 py-3 text-sm font-extrabold shadow-sm active:scale-[0.98]";
const primaryHoneyBtn = `${btnBase} border-[#24201c]/20 bg-[#e9ba66] text-[#24201c]`;
const primaryDarkBtn = `${btnBase} border-[#24201c] bg-[#24201c] text-[#fff8eb]`;
const secondaryBtn = `${btnBase} border-[#24201c]/25 bg-[#fffaf1] text-[#24201c]`;

function Pill({ label, good }: { label: string; good: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2 text-center text-xs font-black ${good ? "bg-[#6f8b78]/16 text-[#476353]" : "bg-[#e9ba66]/22 text-[#7b5a15]"}`}>
      {label}
    </div>
  );
}

function now() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function readableError(error: unknown) {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error || "unknown error");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function unknownCue(): WatchCue {
  return {
    id: uid("watch_cue_guard_unknown"),
    patient_id: DEMO_PATIENT_ID,
    cue: "I do not recognize this person as an enrolled trusted contact. Please stay calm and ask Ananya if you feel unsure.",
    source_event: "capture",
    created_at: new Date().toISOString(),
    should_vibrate: true,
    speak_mode: "native_tts"
  };
}

function readLocation() {
  return new Promise<CaptureSession["location"]>((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          human_label: "CareGrid phone"
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 3000 }
    );
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read photo.")));
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(file);
  });
}

/** Shrink frames before upload so phone only ships a small JPEG to the laptop. */
function compressDataUrl(dataUrl: string, maxEdge = 640, quality = 0.7): Promise<string> {
  if (typeof document === "undefined") return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.width || 1, image.height || 1));
      const width = Math.max(1, Math.round((image.width || maxEdge) * scale));
      const height = Math.max(1, Math.round((image.height || maxEdge) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(dataUrl);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}
