"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  HeartHandshake,
  Loader2,
  Mic,
  MicOff,
  PhoneCall,
  Radio,
  Sparkles,
  Square
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  buildCareContextSeed,
  buildDistressDemoPrompt,
  buildMatchedPersonContext,
  DISTRESS_DEMO_CHIPS
} from "@/lib/ai/live-system-prompt";
import { useCareStore } from "@/lib/care-store";
import {
  startLumoLiveSession,
  type LiveSessionHandle,
  type LiveSessionStatus
} from "@/lib/live/session";
import { captureVideoFrame, extractFaceEmbedding, findTrustedFaceMatch } from "@/lib/vision/face";
import { Badge, Button, Card } from "@/components/ui";

type Props = {
  compact?: boolean;
  title?: string;
  subtitle?: string;
};

/** UI hide only — Live session logic still updates captions/errors when re-enabled. */
const SHOW_GEMINI_LIVE_COMPANION_CARD = false;

export function LumoLive({
  compact = false,
  title = "Lumo Live",
  subtitle = "Real-time voice + vision. Same language as the speaker. Warm support when scared or lost."
}: Props) {
  const { state, addMemoryEvent } = useCareStore();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [error, setError] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [inputCaption, setInputCaption] = useState("");
  const [outputCaption, setOutputCaption] = useState("");
  const [starting, setStarting] = useState(false);
  const sessionRef = useRef<LiveSessionHandle | null>(null);
  const matchVideoRef = useRef<HTMLVideoElement | null>(null);
  const matchStreamRef = useRef<MediaStream | null>(null);
  const lastMatchRef = useRef<string>("");

  const patient = state.patients[0];
  const caregiver = state.caregivers[0];

  const stop = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    matchStreamRef.current?.getTracks().forEach((t) => t.stop());
    matchStreamRef.current = null;
    if (matchVideoRef.current) matchVideoRef.current.srcObject = null;
    setCameraOn(false);
    setStatus("idle");
    setStarting(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const runTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const response = await fetch("/api/live/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, args })
      }).then((res) => res.json());

      if (name === "save_orientation_note" && response.event) {
        addMemoryEvent(response.event);
        toast.success("Orientation note saved");
      }
      if (name === "notify_caregiver" && response.ok) {
        toast.success(response.message || "Caregiver notified");
      }
      return response as Record<string, unknown>;
    },
    [addMemoryEvent]
  );

  const seedCareContext = useCallback(() => {
    const text = buildCareContextSeed({
      patientName: patient?.name || "Rajamma",
      caregiverName: caregiver?.name || "Ananya",
      homeLocation: patient?.home_location || "home",
      trustedPeople: state.people
        .filter((p) => p.consent_status === "consented")
        .map((p) => ({
          name: p.name,
          relation: p.relation,
          memoryNote: p.memory_note
        }))
    });
    sessionRef.current?.sendText(text);
  }, [patient, caregiver, state.people]);

  const start = async () => {
    setStarting(true);
    setError("");
    setInputCaption("");
    setOutputCaption("");
    try {
      const handle = await startLumoLiveSession({
        onStatus: setStatus,
        onError: (message) => {
          setError(message);
          toast.error(message);
        },
        onInputTranscript: (text) => setInputCaption((prev) => (text.length >= prev.length ? text : prev + text)),
        onOutputTranscript: (text) => {
          setOutputCaption((prev) => (text.length >= prev.length ? text : prev + text));
        },
        onToolCall: runTool
      });
      sessionRef.current = handle;
      seedCareContext();
      toast.success("Lumo Live connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Live");
      setStatus("error");
    } finally {
      setStarting(false);
    }
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    sessionRef.current?.setMicMuted(next);
  };

  const toggleCamera = async () => {
    if (!sessionRef.current) {
      toast.error("Start Lumo Live first");
      return;
    }
    try {
      if (cameraOn) {
        await sessionRef.current.setCameraEnabled(false);
        matchStreamRef.current?.getTracks().forEach((t) => t.stop());
        matchStreamRef.current = null;
        if (matchVideoRef.current) matchVideoRef.current.srcObject = null;
        setCameraOn(false);
        return;
      }
      await sessionRef.current.setCameraEnabled(true);
      // Separate stream for local Human face match (does not replace Live video).
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      matchStreamRef.current = stream;
      if (matchVideoRef.current) {
        matchVideoRef.current.srcObject = stream;
        await matchVideoRef.current.play();
      }
      setCameraOn(true);
      toast.success("Camera on — Live sees the room; face match still uses Human embeddings");
    } catch {
      toast.error("Camera unavailable");
    }
  };

  const runLocalFaceMatch = async () => {
    if (!matchVideoRef.current) {
      toast.error("Turn camera on first");
      return;
    }
    try {
      const frame = captureVideoFrame(matchVideoRef.current);
      const face = await extractFaceEmbedding(frame);
      const match = await findTrustedFaceMatch(face.embedding, state.people);
      if (!match) {
        sessionRef.current?.sendText(
          "[Trusted person match] No consented match. Do not invent a name. Say you do not know who this is if asked."
        );
        toast.message("No trusted match");
        return;
      }
      const key = `${match.person.id}:${Math.round(match.similarity * 100)}`;
      if (lastMatchRef.current === key) return;
      lastMatchRef.current = key;
      const ctx = buildMatchedPersonContext({
        name: match.person.name,
        relation: match.person.relation,
        memoryNote: match.person.memory_note,
        lastConversation: match.person.last_conversation_summary,
        similarity: match.similarity
      });
      sessionRef.current?.sendText(ctx);
      toast.success(`Matched ${match.person.name} (Human embedding)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Face match failed");
    }
  };

  const sendChip = (text: string) => {
    if (!sessionRef.current) {
      toast.error("Start Lumo Live first");
      return;
    }
    setInputCaption(text);
    sessionRef.current.sendText(text);
  };

  const active = status === "listening" || status === "speaking" || status === "connecting";

  return (
    <Card className={compact ? "p-4" : "p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge tone="warn">{status === "idle" ? "Live ready" : status}</Badge>
          <h2 className={`font-display mt-2 text-[#24201c] ${compact ? "text-2xl" : "text-3xl"}`}>{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#746b61]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <Button onClick={start} disabled={starting}>
              {starting ? <Loader2 className="animate-spin" size={16} /> : <Radio size={16} />}
              Start Lumo Live
            </Button>
          ) : (
            <Button variant="secondary" onClick={stop}>
              <Square size={16} />
              Stop
            </Button>
          )}
          <Button variant="secondary" onClick={toggleMic} disabled={!sessionRef.current}>
            {micMuted ? <MicOff size={16} /> : <Mic size={16} />}
            {micMuted ? "Unmute" : "Mute"}
          </Button>
          <Button variant="secondary" onClick={toggleCamera} disabled={!sessionRef.current}>
            {cameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
            {cameraOn ? "Camera off" : "Camera"}
          </Button>
          <Button variant="secondary" onClick={runLocalFaceMatch} disabled={!cameraOn || !sessionRef.current}>
            <Sparkles size={16} />
            Match face
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendChip("Please notify my caregiver. I need help.")}
            disabled={!sessionRef.current}
          >
            <PhoneCall size={16} />
            Ask for help
          </Button>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${compact || !SHOW_GEMINI_LIVE_COMPANION_CARD ? "" : "lg:grid-cols-[minmax(0,1fr)_280px]"}`}>
        {SHOW_GEMINI_LIVE_COMPANION_CARD ? (
        <div className="relative overflow-hidden rounded-[28px] border border-white/50 bg-[#24201c] p-5 text-[#fff8eb]">
          <div className="absolute right-[-3rem] top-[-4rem] h-48 w-48 rounded-full bg-[#e9ba66]/20 blur-3xl" />
          <div className="relative flex items-center gap-5">
            <motion.div
              className={compact ? "size-20" : "size-28"}
              animate={
                status === "speaking"
                  ? { scale: [1, 1.08, 1], opacity: [0.9, 1, 0.9] }
                  : status === "listening"
                    ? { scale: [1, 1.03, 1] }
                    : { scale: 1 }
              }
              transition={{ duration: status === "speaking" ? 1.2 : 2.8, repeat: Infinity }}
            >
              <div className="grid h-full w-full place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff8eb,#e9ba66_34%,#7d6aa8_74%,#3f4d7a)] shadow-[0_0_60px_rgba(233,186,102,0.32)]">
                <span className="font-display text-2xl text-[#24201c]">Lu</span>
              </div>
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#e9ba66]">Gemini Live companion</p>
              <p className={`mt-2 leading-7 ${compact ? "text-base" : "text-lg"}`}>
                {outputCaption ||
                  (status === "listening"
                    ? "Listening… speak in any language. If you feel scared, just say so."
                    : status === "connecting"
                      ? "Connecting secure Live session…"
                      : "Start Lumo Live for real-time voice. Face ID still uses Human embeddings.")}
              </p>
              {inputCaption ? (
                <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm text-[#fff8eb]/80">You: {inputCaption}</p>
              ) : null}
            </div>
          </div>
          {error ? <p className="relative mt-4 text-sm text-[#ffb4a2]">{error}</p> : null}
        </div>
        ) : error ? (
          <p className="text-sm text-[#bc6f55]">{error}</p>
        ) : null}

        {!compact ? (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Distress / language demos</p>
            <div className="flex flex-wrap gap-2">
              {DISTRESS_DEMO_CHIPS.map((chip) => (
                <Button key={chip.id} variant="secondary" className="text-xs" onClick={() => sendChip(chip.text)}>
                  <HeartHandshake size={14} />
                  {chip.label}
                </Button>
              ))}
              <Button variant="secondary" className="text-xs" onClick={() => sendChip(buildDistressDemoPrompt())}>
                Full lost prompt
              </Button>
            </div>
            <video ref={matchVideoRef} className="hidden" playsInline muted />
            <p className="text-xs leading-5 text-[#746b61]">
              Stress support uses Live system instructions (warm, short, non-clinical). Multilingual reply is built into Live.
              Face match remains <strong>@vladmandic/human</strong> embeddings.
            </p>
          </div>
        ) : (
          <video ref={matchVideoRef} className="hidden" playsInline muted />
        )}
      </div>
    </Card>
  );
}
