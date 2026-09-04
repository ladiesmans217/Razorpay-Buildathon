"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, EyeOff, Loader2, QrCode, Smartphone, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCareStore } from "@/lib/care-store";
import type { ConversationSummary, PatientCue, PersonProfile, PrivacyDecision } from "@/lib/types";
import { Badge, Button, Card } from "@/components/ui";
import {
  captureVideoFrame,
  dataUrlToImage,
  extractFaceEmbedding,
  fileToImage,
  findTrustedFaceMatch,
  type VisionInput
} from "@/lib/vision/face";
import { loadLatestMobileFrame, subscribeLatestMobileFrame } from "@/lib/live-frame";

type LensMode = "sample" | "webcam" | "photo" | "mobile" | "unknown";

export function SmritiLens() {
  const { state, runLakshmiConversation, addMemoryEvent, setLatestWatchCue, setLatestMobileFrame } = useCareStore();
  const [mode, setMode] = useState<LensMode>("sample");
  const [loading, setLoading] = useState(false);
  const [matched, setMatched] = useState<PersonProfile | null>(state.people.find((p) => p.id === "person_lakshmi") || null);
  const [cue, setCue] = useState(
    "This is Lakshmi aunty. She is your neighbour from downstairs. You met her yesterday near the temple."
  );
  const [privacy, setPrivacy] = useState<PrivacyDecision | null>(null);
  const [transcript, setTranscript] = useState("Lakshmi: Did you eat lunch? Please take your medicine after food.");
  const [cameraActive, setCameraActive] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [matchNote, setMatchNote] = useState("Seeded sample fallback. Enroll real photos to use live descriptor matching.");
  const [matchScore, setMatchScore] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastLiveFrameIdRef = useRef<string | null>(null);

  useEffect(() => {
    const localFrame = loadLatestMobileFrame();
    if (localFrame && !state.latestMobileFrame) {
      lastLiveFrameIdRef.current = localFrame.id;
      setLatestMobileFrame(localFrame);
    }
    return subscribeLatestMobileFrame((frame) => {
      if (lastLiveFrameIdRef.current === frame.id) return;
      lastLiveFrameIdRef.current = frame.id;
      setLatestMobileFrame(frame);
      toast.success("Phone frame received on SmritiLens");
    });
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setMode("webcam");
      toast.success("Camera ready. If venue permissions fail, sample mode still works.");
    } catch {
      toast.error("Camera unavailable. Use sample or phone-upload fallback.");
    }
  };

  const markUnknown = async (
    summary = "Unknown person detected. Identity not stored.",
    location = "Near MSRIT gate",
    source: "camera" | "mobile" = "camera"
  ) => {
    const decision = await fetch("/api/privacy-decision", {
      method: "POST",
      body: JSON.stringify({ event_type: "unknown_person_detected", location })
    }).then((res) => res.json());
    setMatched(null);
    setPrivacy(decision);
    setMatchScore(null);
    setMatchNote(decision.reason || "Unknown face remains unknown and raw media expires by default.");
    addMemoryEvent({
      id: `event_unknown_${Date.now()}`,
      patient_id: "patient_rajamma",
      event_type: "unknown_person_detected",
      timestamp: new Date().toISOString(),
      source,
      location,
      people_involved: [],
      summary,
      risk_score: 62,
      privacy_level: decision.visibility,
      retention_policy: decision.retention,
      action_items: ["Notify caregiver only if risk remains high."]
    });
  };

  const saveTrustedMatch = async (person: PersonProfile, note: string, score?: string, source: "camera" | "mobile" = "camera") => {
    const cueResponse = await fetch("/api/generate-patient-cue", {
      method: "POST",
      body: JSON.stringify({
        context: `${person.name} is Rajamma's ${person.relation}. ${person.memory_note} Last conversation: ${person.last_conversation_summary}`
      })
    }).then((res) => res.json() as Promise<PatientCue>);
    setMatched(person);
    setCue(cueResponse.cue);
    setPrivacy(null);
    setMatchNote(note);
    setMatchScore(score || null);
    setLatestWatchCue({
      id: `watch_cue_${Date.now()}`,
      patient_id: "patient_rajamma",
      cue: cueResponse.cue,
      source_event: "person_recognition",
      created_at: new Date().toISOString(),
      person_name: person.name,
      relation: person.relation,
      should_vibrate: true,
      speak_mode: "speech_synthesis"
    });
    addMemoryEvent({
      id: `event_seen_${Date.now()}`,
      patient_id: "patient_rajamma",
      event_type: "person_seen",
      timestamp: new Date().toISOString(),
      source,
      location: "Ramaiah temple gate",
      people_involved: [person.name],
      summary: `SmritiLens recognized ${person.name}, an enrolled trusted ${person.role}.`,
      risk_score: 4,
      privacy_level: person.allowed_visibility,
      retention_policy: "24_hours",
      action_items: ["Offer Lumo recall cue."]
    });
  };

  const analyzeInput = async (input: VisionInput, nextMode: LensMode) => {
    const face = await extractFaceEmbedding(input);
    const match = await findTrustedFaceMatch(face.embedding, state.people);
    if (!match) {
      await markUnknown(
        "A face was detected, but it did not match any enrolled trusted person.",
        nextMode === "mobile" ? "Phone camera frame" : "Camera frame",
        nextMode === "mobile" ? "mobile" : "camera"
      );
      return;
    }
    const score = `${Math.round(match.similarity * 100)}% similarity`;
    await saveTrustedMatch(
      match.person,
      `Live ${nextMode} embedding matched against ${match.person.face_samples || 1} consented sample${match.person.face_samples === 1 ? "" : "s"}.`,
      score,
      nextMode === "mobile" ? "mobile" : "camera"
    );
  };

  const recognizeTrusted = async (nextMode: LensMode = mode) => {
    setLoading(true);
    try {
      if (nextMode === "unknown") {
        await markUnknown("Unknown person detected outside safe zone. Identity not stored.");
        return;
      }

      if (nextMode === "webcam" && videoRef.current) {
        setMode("webcam");
        const frame = captureVideoFrame(videoRef.current);
        await analyzeInput(frame, "webcam");
        return;
      }

      const person = state.people.find((p) => p.id === "person_lakshmi") || null;
      if (person) await saveTrustedMatch(person, "Seeded fallback match. Real enrolled embeddings override this path.", "demo fallback");
    } finally {
      setLoading(false);
    }
  };

  const analyzePhoto = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const preview = URL.createObjectURL(file);
      setSelectedImage(preview);
      setMode("photo");
      const image = await fileToImage(file);
      await analyzeInput(image, "photo");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze that photo.");
    } finally {
      setLoading(false);
    }
  };

  const analyzeMobileFrame = async () => {
    if (!state.latestMobileFrame?.data_url) {
      toast.error("No phone camera frame received yet.");
      return;
    }
    setLoading(true);
    try {
      setSelectedImage(state.latestMobileFrame.data_url);
      setMode("mobile");
      const image = await dataUrlToImage(state.latestMobileFrame.data_url);
      await analyzeInput(image, "mobile");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze phone frame.");
    } finally {
      setLoading(false);
    }
  };

  const summarizeConversation = async () => {
    setLoading(true);
    try {
      const summary = await fetch("/api/summarize-conversation", {
        method: "POST",
        body: JSON.stringify({ transcript, person: matched?.name || "Lakshmi" })
      }).then((res) => res.json() as Promise<ConversationSummary>);
      runLakshmiConversation(summary, transcript);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[#24201c]/10 p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">SmritiLens Live</p>
            <h2 className="mt-1 font-display text-3xl">Trusted-person recall</h2>
          </div>
          <Badge tone="privacy">consented embeddings only</Badge>
        </div>

        <div className="p-5">
          <div className="relative overflow-hidden rounded-[32px] bg-[#24201c] p-4">
            {mode === "webcam" ? (
              <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full rounded-[24px] object-cover opacity-90" />
            ) : mode === "unknown" ? (
              <div className="grid aspect-[4/3] place-items-center rounded-[24px] bg-[#fff8eb]/8 text-center text-[#fff8eb]">
                <div>
                  <EyeOff className="mx-auto mb-4" size={42} />
                  <p className="font-display text-3xl">Unknown person</p>
                  <p className="mt-2 text-sm text-[#fff8eb]/64">No identity stored. Raw media expires by default.</p>
                </div>
              </div>
            ) : mode === "photo" || mode === "mobile" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedImage || state.latestMobileFrame?.data_url}
                alt="Captured frame for SmritiLens"
                className="aspect-[4/3] w-full rounded-[24px] object-cover"
              />
            ) : (
              <Image
                src="/samples/lakshmi.svg"
                width={640}
                height={640}
                alt="Sample trusted person Lakshmi"
                className="aspect-[4/3] w-full rounded-[24px] object-cover"
              />
            )}
            <div className="absolute left-8 top-8 rounded-full border border-white/15 bg-[#24201c]/76 px-4 py-2 text-sm font-semibold text-[#fff8eb] backdrop-blur-xl">
              {mode === "sample"
                ? "Sample trusted person"
                : mode === "webcam"
                  ? "Camera stream"
                  : mode === "mobile"
                    ? "Phone camera frame"
                    : mode === "photo"
                      ? "Uploaded phone photo"
                      : "Privacy-safe unknown"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => { setMode("sample"); void recognizeTrusted("sample"); }} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Recognize Lakshmi
            </Button>
            <Button variant="secondary" onClick={startCamera}>
              <Camera size={16} />
              Use camera
            </Button>
            <Button variant="secondary" onClick={() => void recognizeTrusted("webcam")} disabled={!cameraActive || loading}>
              <Sparkles size={16} />
              Match camera frame
            </Button>
            <Button variant="secondary" onClick={() => { setMode("unknown"); void recognizeTrusted("unknown"); }}>
              <EyeOff size={16} />
              Simulate unknown
            </Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#24201c]/15 bg-white/60 px-5 py-2.5 text-sm font-semibold transition hover:bg-white">
              <Upload size={16} />
              Phone photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => void analyzePhoto(event.target.files?.[0])}
              />
            </label>
            <Button variant="secondary" onClick={analyzeMobileFrame} disabled={loading || !state.latestMobileFrame}>
              <Smartphone size={16} />
              Analyze phone frame
            </Button>
            <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#24201c]/15 bg-white/60 px-5 py-2.5 text-sm font-semibold transition hover:bg-white" href="/mobile-camera">
              <QrCode size={16} />
              Phone camera route
            </Link>
          </div>
          <div className="mt-4 rounded-3xl bg-white/52 p-4 text-sm leading-6 text-[#746b61]">
            {matchNote}
            {matchScore && <span className="ml-2 font-bold text-[#3f4d7a]">{matchScore}</span>}
          </div>
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Detected context</p>
              <h2 className="mt-1 font-display text-3xl">{matched ? matched.name : "Unknown person"}</h2>
            </div>
            <Badge tone={matched ? "safe" : "danger"}>{matched ? matched.trust_level : "not identified"}</Badge>
          </div>
          {matched ? (
            <div className="mt-5 space-y-3">
              <Info label="Relation" value={matched.relation} />
              <Info label="Last met" value={`${matched.last_seen_location} - ${new Date(matched.last_seen_at).toLocaleDateString("en-IN")}`} />
              <Info label="Last conversation" value={matched.last_conversation_summary} />
              <div className="rounded-3xl bg-[#3f4d7a]/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#3f4d7a]">Lumo cue</p>
                <p className="mt-2 text-lg leading-7">{cue}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-[#bc6f55]/12 p-4">
              <p className="font-semibold text-[#914d3c]">Privacy decision</p>
              <p className="mt-2 text-sm leading-6 text-[#746b61]">
                {privacy?.reason || "Unknown people are not labelled. Raw media is not stored by default."}
              </p>
            </div>
          )}
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Conversation Memory</p>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            className="mt-4 min-h-32 w-full rounded-3xl border border-[#24201c]/10 bg-white/70 p-4 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#3f4d7a]/20"
          />
          <Button className="mt-4" onClick={summarizeConversation} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            Summarize and save
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#24201c]/10 bg-white/48 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
