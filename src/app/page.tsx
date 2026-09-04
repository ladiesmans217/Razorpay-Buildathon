"use client";

import Link from "next/link";
import {
  BookOpen,
  Camera,
  FileText,
  HeartHandshake,
  Map,
  Radio,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AgentPanel } from "@/components/agent-panel";
import { Badge, Card, LinkButton, SectionHeader } from "@/components/ui";

const modules: Array<{ title: string; copy: string; Icon: LucideIcon; href: string; hidden?: boolean }> = [
  // Hidden from home cards (routes still work)
  { title: "Lumo Live", copy: "Real-time multimodal companion: voice, vision, barge-in, stress support.", Icon: Radio, href: "/live", hidden: true },
  { title: "SmritiLens", copy: "Recognizes enrolled trusted people and gives context back.", Icon: Camera, href: "/lens", hidden: true },
  { title: "SafePath", copy: "Simulates geofence exit, risky places, and calming cues.", Icon: Map, href: "/safe-path" },
  { title: "CareCircle", copy: "Turns alerts into neighbour, ASHA, pharmacy, and RWA tasks.", Icon: HeartHandshake, href: "/care-circle" },
  { title: "CareLearn", copy: "Gemini-generated training for the whole community ring.", Icon: BookOpen, href: "/carelearn" },
  { title: "Doctor Brief", copy: "Generates doctor-ready weekly caregiver summaries.", Icon: FileText, href: "/doctor-report" }
];

export default function HomePage() {
  return (
    <AppShell>
      <section className="overflow-hidden rounded-[40px] bg-[#24201c] p-6 text-[#fff8eb] shadow-[0_35px_110px_rgba(36,32,28,0.25)] md:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn" className="border-[#e9ba66]/30 bg-[#e9ba66]/16 text-[#fff1c2]">
                Razorpay Buildathon
              </Badge>
              <Badge tone="neutral" className="border-white/20 bg-white/10 text-[#fff8eb]">
                Track 05 : Open Track
              </Badge>
              <Badge tone="neutral" className="border-white/20 bg-white/10 text-[#fff8eb]">
                Built by Manjunath Patil
              </Badge>
            </div>
            <h1 className="font-display mt-8 max-w-5xl text-6xl leading-[0.94] md:text-8xl">
              RememberMe CareGrid
            </h1>
            <p className="mt-6 max-w-3xl text-xl leading-8 text-[#fff8eb]/76">
              AI memory, wandering safety, community care coordination, and CareLearn dementia training for Indian families.
            </p>
            <p className="mt-6 max-w-3xl text-2xl leading-9 text-[#fff8eb]">
              RememberMe does not just track dementia patients. It gives them back context: who they met, where they are, what was said, and who can help.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {/* Hidden: Launch Lumo Live — route /live still works
              <LinkButton href="/live" className="bg-[#fff8eb] text-[#24201c] hover:bg-white">
                Launch Lumo Live
              </LinkButton>
              */}
              <LinkButton href="/patient" className="bg-[#fff8eb] text-[#24201c] hover:bg-white">
                Patient hub
              </LinkButton>
              <LinkButton href="/caregiver" variant="secondary" className="border-white/20 bg-white/10 text-[#fff8eb] hover:bg-white/15">
                Caregiver Dashboard
              </LinkButton>
              <LinkButton href="/carelearn" variant="secondary" className="border-white/20 bg-white/10 text-[#fff8eb] hover:bg-white/15">
                CareLearn training
              </LinkButton>
            </div>
          </div>
          <div className="rounded-[34px] border border-white/10 bg-white/7 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e9ba66]">Product promise</p>
            <div className="mt-5 space-y-4">
              {[
                "Consent-aware care timeline from important events, not continuous surveillance.",
                "Recognizes only enrolled trusted people using consented face embeddings.",
                "Tracks routine changes and prepares caregiver summaries for doctor visits.",
                "Turns neighbours, ASHA workers, pharmacies, and RWA volunteers into a trained care network."
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-3xl bg-[#fff8eb]/8 p-4">
                  <ShieldCheck className="mt-1 shrink-0 text-[#e9ba66]" size={18} />
                  <p className="text-sm leading-6 text-[#fff8eb]/78">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules
          .filter((item) => !item.hidden)
          .map(({ title, copy, Icon, href }) => (
            <Link href={href} key={title}>
              <Card className="h-full transition hover:-translate-y-1 hover:bg-white/80">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#24201c]/8 text-[#24201c]">
                  <Icon size={20} />
                </span>
                <h2 className="mt-5 font-display text-2xl">{title}</h2>
                <p className="mt-3 text-sm leading-6 text-[#746b61]">{copy}</p>
              </Card>
            </Link>
          ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="ink-panel">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e9ba66]">Emotional pitch</p>
          <h2 className="font-display mt-4 text-5xl leading-tight">Remember less alone. Care less alone.</h2>
          <p className="mt-5 text-lg leading-8 text-[#fff8eb]/72">
            The patient gets a soft recall layer. The family gets one live care network. The community gets CareLearn training that tells them what to do without exposing private data.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Patient", "Family", "Neighbour", "ASHA", "Pharmacy", "RWA", "Doctor", "CareLearn"].map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
                {tag}
              </span>
            ))}
          </div>
        </Card>
        <div>
          <SectionHeader
            eyebrow="Technical credibility"
            title="Gemini agents that do work"
            body="The demo is deliberately action-oriented: summarize, cue, alert, assign, train, resolve, and report."
          />
          <AgentPanel />
        </div>
      </section>
    </AppShell>
  );
}
