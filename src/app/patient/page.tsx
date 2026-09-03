"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Heart, Loader2, Mic, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
// import { LumoLive } from "@/components/lumo-live"; // hidden from patient hub UI
import { LumoOrb } from "@/components/lumo-orb";
import { Timeline } from "@/components/timeline";
import { Button, Card, MetricCard, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";

export default function PatientPage() {
  const { state, runMemoryJournal } = useCareStore();
  const [journal, setJournal] = useState("I remember going to Mysore with my husband.");
  const [loading, setLoading] = useState(false);
  const patient = state.patients[0];

  const saveJournal = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/memory-journal", {
        method: "POST",
        body: JSON.stringify({ transcript: journal, patient_id: patient.id })
      }).then((res) => res.json());
      runMemoryJournal(response, journal);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Ring 1 - Patient"
        title="Patient Home Hub"
        body="Large, gentle controls for Lumo cues, memory journaling, routine checks, and safe contact. No diagnosis language, no surveillance posture."
      />
      {/* Hidden from patient hub UI (LumoLive + /live still exist)
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#746b61]">
          Prefer continuous voice? Open <strong>Lumo Live</strong> for real-time multimodal support.
        </p>
        <LinkButton href="/live">Open Lumo Live</LinkButton>
      </div>
      */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {/* <LumoLive
            compact
            title="Lumo Live (optional)"
            subtitle="Start for real-time voice. Browser cue below still works offline without a Gemini key."
          /> */}
          <LumoOrb
            large
            cue="Good morning Rajamma. Today is Friday. Ananya will visit this evening. Let us start slowly."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Morning orientation" value="2 / 3" detail="Slightly below usual. Caregiver awareness only." tone="warn" />
            <MetricCard label="Medicine routine" value="8:15 AM" detail="Morning medicine marked after breakfast." tone="safe" />
            <MetricCard label="Current safety" value="Home" detail="Inside 500m safe zone near MSRIT." tone="safe" />
          </div>
          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Memory Journal</p>
            <h2 className="mt-2 font-display text-3xl">Save a voluntary memory</h2>
            <textarea
              value={journal}
              onChange={(event) => setJournal(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-3xl border border-[#24201c]/10 bg-white/70 p-4 text-lg leading-7 outline-none focus:ring-2 focus:ring-[#3f4d7a]/20"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={saveJournal} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Mic size={16} />}
                Save memory
              </Button>
              <Button variant="secondary">
                <CheckCircle2 size={16} />
                I am okay
              </Button>
              <Button variant="secondary">
                <Bell size={16} />
                Notify caregiver
              </Button>
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#6f8b78]/14 text-[#476353]">
                <Heart size={20} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#746b61]">Today schedule</p>
                <h2 className="font-display text-2xl">Simple, familiar rhythm</h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {["Breakfast and medicine", "Temple walk with Lakshmi", "Ananya visits this evening"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-3xl bg-white/52 p-4">
                  <ShieldCheck size={18} className="text-[#6f8b78]" />
                  <span className="font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </Card>
          <Timeline events={state.memoryEvents} limit={5} />
        </div>
      </div>
    </AppShell>
  );
}
