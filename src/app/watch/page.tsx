"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Bell, CheckCircle2, MapPin, PlayCircle, ShieldAlert, Smartphone, Vibrate, Watch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

export default function WatchPage() {
  const { state, addWearEvent } = useCareStore();
  const latestCue = state.latestWatchCue;
  const [origin, setOrigin] = useState("");
  const rescueUrl = `${origin}/rescue/${DEMO_PATIENT_ID}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const pushEvent = async (type: "ok_checkin" | "notify_caregiver" | "location_ping" | "alert_acknowledged") => {
    const timestamp = new Date().toISOString();
    const base = {
      id: uid("wear"),
      patient_id: DEMO_PATIENT_ID,
      type,
      timestamp,
      message:
        type === "ok_checkin"
          ? "Rajamma tapped I'm okay on Galaxy Watch."
          : type === "location_ping"
            ? "Galaxy Watch GPS ping near MSRIT."
            : type === "alert_acknowledged"
              ? "Wandering alert acknowledged on watch."
              : "Rajamma tapped notify caregiver on Galaxy Watch."
    };
    const event =
      type === "location_ping"
        ? { ...base, latitude: 13.0319, longitude: 77.5688 }
        : base;
    addWearEvent(event);
    if ("vibrate" in navigator) navigator.vibrate?.([140, 80, 140]);
    await fetch(type === "ok_checkin" ? "/api/watch/checkin" : type === "location_ping" ? "/api/watch/location" : "/api/watch/alert", {
      method: "POST",
      body: JSON.stringify(event)
    });
  };

  const speakCue = () => {
    if (!latestCue?.cue || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latestCue.cue);
    utterance.rate = 0.84;
    utterance.pitch = 0.95;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
    if (latestCue.should_vibrate && "vibrate" in navigator) navigator.vibrate?.([120, 70, 120]);
  };

  const triggerSos = async () => {
    if ("vibrate" in navigator) navigator.vibrate?.([240, 80, 240, 80, 360]);
    await fetch("/api/sos", {
      method: "POST",
      body: JSON.stringify({
        patient_id: DEMO_PATIENT_ID,
        message: "Manual SOS triggered from the watch demo panel."
      })
    });
  };

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Galaxy Watch 4"
        title="Wear OS companion flow"
        body="The MVP includes browser and Wear OS flows: I'm okay, notify caregiver, GPS ping, vibration alert, and alert acknowledgement."
      />
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="bg-[#24201c] text-[#fff8eb]">
          <div className="mx-auto max-w-[280px] rounded-[48px] border border-white/12 bg-black/30 p-5 shadow-2xl">
            <div className="rounded-[38px] bg-[#111] p-4 text-center">
              <Watch className="mx-auto text-[#e9ba66]" size={30} />
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#e9ba66]">RememberMe</p>
              <h2 className="mt-2 font-display text-3xl">Rajamma</h2>
              <p className="mt-2 text-sm text-[#fff8eb]/68">SafePath companion</p>
              <div className="mt-4 rounded-[28px] bg-white/10 p-3 text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#e9ba66]">Latest Lumo cue</p>
                <p className="mt-2 text-sm leading-5 text-[#fff8eb]">
                  {latestCue?.cue || "No cue received yet."}
                </p>
              </div>
              <div className="mt-5 space-y-3">
                <button onClick={speakCue} className="w-full rounded-full bg-[#e9ba66] px-4 py-3 text-sm font-bold text-[#24201c]">
                  Speak cue
                </button>
                <button onClick={() => void pushEvent("ok_checkin")} className="w-full rounded-full bg-[#6f8b78] px-4 py-3 text-sm font-bold text-white">
                  I'm okay
                </button>
                <button onClick={() => void pushEvent("notify_caregiver")} className="w-full rounded-full bg-[#bc6f55] px-4 py-3 text-sm font-bold text-white">
                  Notify caregiver
                </button>
                <button onClick={() => void triggerSos()} className="w-full rounded-full bg-[#f0d1c5] px-4 py-3 text-sm font-bold text-[#7f3d2d]">
                  SOS SMS + call
                </button>
                <button onClick={() => void pushEvent("location_ping")} className="w-full rounded-full bg-[#3f4d7a] px-4 py-3 text-sm font-bold text-white">
                  Send GPS
                </button>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="mb-5 rounded-[28px] border border-[#3f4d7a]/20 bg-[#3f4d7a]/8 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f4d7a]">Camera to watch cue</p>
                  <h3 className="mt-1 font-display text-2xl">{latestCue?.person_name || "Waiting for recognition"}</h3>
                </div>
                <Badge tone={latestCue?.should_vibrate ? "warn" : "privacy"}>{latestCue?.source_event || "routine"}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#746b61]">
                {latestCue?.cue || "When SmritiLens recognizes an enrolled trusted person, Gemini generates a dementia-friendly cue and sends it here."}
              </p>
              <Button className="mt-4" onClick={speakCue} variant="secondary">
                <PlayCircle size={16} />
                Speak latest cue
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Hardware implementation</p>
                <h2 className="mt-1 font-display text-3xl">Samsung Galaxy Watch 4 plan</h2>
              </div>
              <Badge tone="safe">Wear OS</Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Setup title="Build" icon={<Smartphone size={18} />} copy="Open /wearos in Android Studio, set API URL, build debug APK." />
              <Setup title="Install" icon={<Watch size={18} />} copy="Enable developer options and wireless debugging on Galaxy Watch 4, then install via ADB." />
              <Setup title="Location" icon={<MapPin size={18} />} copy="Use Android location APIs / Fused Location Provider and send HTTPS pings." />
              <Setup title="Vibration" icon={<Vibrate size={18} />} copy="Vibrate on wandering alert, then let patient tap acknowledge or notify caregiver." />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-[#bc6f55]" />
              <p className="font-semibold">Recent watch events</p>
            </div>
            <div className="mt-4 space-y-3">
              {state.wearEvents.length ? (
                state.wearEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-3xl bg-white/52 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{event.message}</p>
                      <Badge tone="indigo">{event.type}</Badge>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#746b61]">{new Date(event.timestamp).toLocaleString("en-IN")}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl bg-white/52 p-4 text-sm text-[#746b61]">Use the watch mock buttons to log demo events.</div>
              )}
            </div>
            <Button className="mt-4" variant="secondary" onClick={() => void pushEvent("alert_acknowledged")}>
              <CheckCircle2 size={16} />
              Mock alert acknowledgement
            </Button>
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-[#bc6f55]" />
                  <p className="font-semibold">Bystander rescue card</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#746b61]">
                  The watch can show this QR/text card if Rajamma is outside the safe zone and a bystander is nearby.
                  Scanning opens a public help card with a “Notify caregiver with this location” button.
                </p>
                <p className="mt-3 rounded-3xl bg-white/52 p-3 text-sm font-semibold text-[#3f4d7a]">
                  {origin ? rescueUrl : "Preparing rescue link..."}
                </p>
              </div>
              {origin ? (
                <div className="rounded-3xl bg-white p-4">
                  <QRCodeSVG value={rescueUrl} size={156} bgColor="#ffffff" fgColor="#24201c" />
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Setup({ title, copy, icon }: { title: string; copy: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white/52 p-4">
      <div className="flex items-center gap-2 font-semibold text-[#3f4d7a]">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#746b61]">{copy}</p>
    </div>
  );
}
