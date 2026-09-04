"use client";

import { AppShell } from "@/components/app-shell";
import { LumoLive } from "@/components/lumo-live";
import { Card, SectionHeader } from "@/components/ui";

export default function LivePage() {
  return (
    <AppShell>
      <SectionHeader
        eyebrow="Track 05 : Open Track"
        title="Lumo Live"
        body="Continuous voice and optional camera with Gemini Live. Reply in the speaker's language. Warm, human support when someone is scared or lost. Face recognition stays on local Human embeddings — Live only speaks the context."
      />
      <LumoLive />
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#bc6f55]">Barge-in</p>
          <p className="mt-2 text-sm leading-6 text-[#746b61]">
            Interrupt Lumo mid-sentence. Playback stops and the session listens again.
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#bc6f55]">Distress care</p>
          <p className="mt-2 text-sm leading-6 text-[#746b61]">
            Say you are scared or lost — or use the demo chips — for short grounding replies, not diagnosis.
          </p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#bc6f55]">Face ID unchanged</p>
          <p className="mt-2 text-sm leading-6 text-[#746b61]">
            Enable camera, then Match face. Matching still uses consented embeddings via @vladmandic/human.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
