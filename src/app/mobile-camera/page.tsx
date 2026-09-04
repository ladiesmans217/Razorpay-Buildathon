"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Camera, Loader2, MapPin, RefreshCcw, RotateCcw, ScanFace, Smartphone, StopCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import type { MobileFrame } from "@/lib/types";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";
import { saveLatestMobileFrame } from "@/lib/live-frame";

export default function MobileCameraPage() {
  const { state, setLatestMobileFrame, setLatestLocation } = useCareStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [origin, setOrigin] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [status, setStatus] = useState("Open this page on the Android phone over HTTPS, then start camera.");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (!autoSend) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = setInterval(() => void captureAndSend("auto"), 2000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoSend]);

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  };

  const startCamera = async (nextFacingMode = facingMode) => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreaming(true);
      setFacingMode(nextFacingMode);
      setStatus(`${nextFacingMode === "user" ? "Selfie" : "Rear"} camera is live. Send a frame to the laptop dashboard.`);
    } catch {
      setStatus(`${nextFacingMode === "user" ? "Selfie" : "Rear"} camera failed. Try switching camera, then start again.`);
    }
  };

  const switchCamera = async () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    await startCamera(next);
  };

  const captureAndSend = async (mode: "manual" | "auto" = "manual") => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      setStatus("Camera frame is not ready yet.");
      return;
    }
    setSending(true);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / videoRef.current.videoWidth);
      canvas.width = Math.round(videoRef.current.videoWidth * scale);
      canvas.height = Math.round(videoRef.current.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not capture frame.");
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
      const location = await readLocation();
      const frame: MobileFrame = {
        id: uid("mobile_frame"),
        patient_id: DEMO_PATIENT_ID,
        data_url: dataUrl,
        captured_at: new Date().toISOString(),
        source_device: "android_phone",
        ...(location ? { location } : {})
      };
      const synced = await saveLatestMobileFrame(frame);
      setLatestMobileFrame(frame);
      if (location) {
        setLatestLocation({
          patient_id: DEMO_PATIENT_ID,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          captured_at: frame.captured_at,
          source: "mobile_phone"
        });
      }
      await fetch("/api/mobile-frame", { method: "POST", body: JSON.stringify({ frame, mode }) });
      setStatus(
        `Captured and sent at ${new Date(frame.captured_at).toLocaleTimeString("en-IN")}. ${
          synced ? "Laptop /lens should enable Analyze phone frame now." : "Saved on this device, but Firebase live-frame sync failed. Check Firestore rules."
        }`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send phone frame.");
    } finally {
      setSending(false);
    }
  };

  const routeUrl = origin ? `${origin}/mobile-camera` : "/mobile-camera";

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Phone camera"
        title="Android phone as SmritiLens input"
        body="Phone browser camera needs HTTPS unless it is localhost. Use Vercel, Cloudflare Tunnel, ngrok, or local HTTPS for a real phone demo."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[#24201c]/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Live phone feed</p>
                <h2 className="mt-1 font-display text-3xl">Frame relay</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge tone="privacy">{facingMode === "user" ? "selfie" : "rear"}</Badge>
                <Badge tone={streaming ? "safe" : "warn"}>{streaming ? "camera live" : "waiting"}</Badge>
              </div>
            </div>
          </div>
          <div className="p-5">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-[3/4] max-h-[620px] w-full rounded-[32px] bg-[#24201c] object-cover" />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={() => void startCamera()}>
                <Camera size={16} />
                Start phone camera
              </Button>
              <Button variant="secondary" onClick={switchCamera}>
                <RefreshCcw size={16} />
                Switch to {facingMode === "user" ? "rear" : "selfie"}
              </Button>
              <Button variant="secondary" onClick={() => void startCamera(facingMode)} disabled={!streaming}>
                <RotateCcw size={16} />
                Restart camera
              </Button>
              <Button variant="secondary" onClick={() => void captureAndSend("manual")} disabled={sending || !streaming}>
                {sending ? <Loader2 className="animate-spin" size={16} /> : <ScanFace size={16} />}
                Capture & send
              </Button>
              <Button variant={autoSend ? "primary" : "secondary"} onClick={() => setAutoSend((current) => !current)} disabled={!streaming}>
                {autoSend ? <StopCircle size={16} /> : <Smartphone size={16} />}
                {autoSend ? "Stop auto-send" : "Auto every 2s"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Open on phone</p>
            <div className="mt-4 grid place-items-center rounded-[28px] bg-white/70 p-5">
              <QRCodeSVG value={routeUrl} size={210} bgColor="transparent" fgColor="#24201c" />
            </div>
            <p className="mt-4 break-all text-sm font-semibold text-[#3f4d7a]">{routeUrl}</p>
            <p className="mt-3 text-sm leading-6 text-[#746b61]">
              For the two-device buildathon demo, Firebase env vars make the phone frame appear on the laptop SmritiLens page in realtime.
            </p>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[#bc6f55]" />
              <p className="font-semibold">Latest GPS</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#746b61]">
              {state.latestLocation
                ? `${state.latestLocation.latitude.toFixed(5)}, ${state.latestLocation.longitude.toFixed(5)} from ${state.latestLocation.source}`
                : "No location captured yet."}
            </p>
            <div className="mt-4 rounded-3xl bg-[#24201c]/6 p-4 text-sm leading-6 text-[#746b61]">{status}</div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function readLocation() {
  return new Promise<MobileFrame["location"]>((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(undefined);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 3000 }
    );
  });
}
