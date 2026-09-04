"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  BookOpenCheck,
  FileText,
  HeartHandshake,
  MapPinned,
  ShieldCheck,
  Stethoscope,
  Users
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhoneOrDesktopShell } from "@/components/mobile-app-shell";
import { Badge, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";

const roleCards = [
  {
    role: "Family",
    title: "Caregiver control",
    body: "See patient status, alerts, known visitors, memory timeline, wearable health, privacy controls, and doctor brief.",
    href: "/caregiver",
    Icon: Users,
    tone: "indigo" as const
  },
  {
    role: "ASHA",
    title: "Visit and care notes",
    body: "Check wandering events, medication routine, sleep notes, caregiver stress, and CareLearn visit learning before meeting the family.",
    href: "/care-circle",
    Icon: Stethoscope,
    tone: "safe" as const
  },
  {
    role: "RWA",
    title: "Emergency response",
    body: "Accept locality-level safety tasks, keep the patient away from traffic, mark reached, and resolve only after caregiver confirmation.",
    href: "/care-circle",
    Icon: ShieldCheck,
    tone: "warn" as const
  }
];

const PHONE_PREFETCH = ["/memory-capture", "/safe-path", "/care-circle", "/carelearn"];

export default function CommunityAppPage() {
  const { state } = useCareStore();
  const activeAlerts = state.alerts.filter((alert) => alert.status !== "resolved");
  const activeTasks = state.communityTasks.filter((task) => !["completed", "cancelled"].includes(task.status));
  const latestLocation = state.latestLocation;
  const health = state.latestHealthSnapshot;
  const latestDoctorReport = state.doctorReports.length ? state.doctorReports[state.doctorReports.length - 1] : null;

  // Warm phone tab routes after idle so later full navigations hit cache faster.
  useEffect(() => {
    const warm = () => {
      for (const href of PHONE_PREFETCH) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = href;
        link.as = "document";
        document.head.appendChild(link);
        void fetch(href, { credentials: "same-origin" }).catch(() => undefined);
      }
    };
    const ric = window.requestIdleCallback?.(warm, { timeout: 2500 });
    const timer = typeof ric === "number" ? undefined : window.setTimeout(warm, 1200);
    return () => {
      if (typeof ric === "number" && window.cancelIdleCallback) window.cancelIdleCallback(ric);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const body = (
    <>
      <section className="rounded-[36px] bg-[#24201c] p-6 text-[#fff8eb] shadow-[0_24px_80px_rgba(36,32,28,0.22)]">
        <Badge tone="warn" className="border-[#e9ba66]/30 bg-[#e9ba66]/16 text-[#fff1c2]">
          Android community APK
        </Badge>
        <h1 className="mt-5 font-display text-5xl leading-[0.96]">CareGrid Community</h1>
        <p className="mt-4 text-lg leading-7 text-[#fff8eb]/75">
          A mobile command surface for Rajamma&apos;s family, ASHA worker, and RWA care responders. It shares the same Firebase care state as the web dashboard and watch.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MiniStat label="Active alerts" value={String(activeAlerts.length)} />
          <MiniStat label="Open tasks" value={String(activeTasks.length)} />
          <MiniStat label="Health source" value={health?.source || "mixed"} />
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {roleCards.map(({ role, title, body, href, Icon, tone }) => (
          <Link href={href} key={role}>
            <Card className="h-full transition hover:-translate-y-1 hover:bg-white/85">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-[#24201c]/8">
                  <Icon size={20} />
                </span>
                <Badge tone={tone}>{role}</Badge>
              </div>
              <h2 className="mt-5 font-display text-3xl">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#746b61]">{body}</p>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader
            eyebrow="Privacy boundary"
            title="Not a neighbour feed"
            body="Neighbours should usually use a one-time task or rescue QR link. The installable app is for family, ASHA, RWA, and approved care roles because they need continuity and accountability."
          />
          <div className="grid gap-3">
            {[
              ["Family", "Full caregiver dashboard, memory timeline, doctor summary, privacy controls."],
              ["ASHA worker", "Visit brief, medication and sleep patterns, caregiver support prompts, CareLearn training."],
              ["RWA volunteer", "Emergency task state, safe approach steps, rescue protocol, no private medical history."],
              ["Neighbour", "Task/rescue link only unless explicitly enrolled by the caregiver."]
            ].map(([title, body]) => (
              <div key={title} className="rounded-3xl bg-white/60 p-4">
                <p className="font-bold">{title}</p>
                <p className="mt-1 text-sm leading-6 text-[#746b61]">{body}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Live care state" title="Field-ready context" />
          <div className="grid gap-3">
            <div className="rounded-3xl bg-white/60 p-4">
              <div className="flex items-center gap-2">
                <MapPinned size={18} className="text-[#3f4d7a]" />
                <p className="font-bold">Latest location</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#746b61]">
                {latestLocation
                  ? `${latestLocation.latitude.toFixed(5)}, ${latestLocation.longitude.toFixed(5)} - ${latestLocation.distance_from_home_m ?? "unknown"}m from home center.`
                  : "No phone or watch location has arrived yet."}
              </p>
            </div>
            <div className="rounded-3xl bg-white/60 p-4">
              <div className="flex items-center gap-2">
                <BookOpenCheck size={18} className="text-[#6f8b78]" />
                <p className="font-bold">CareLearn progress</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#746b61]">
                {state.careLearnTrainings.length
                  ? `${state.careLearnTrainings.length} role training record${state.careLearnTrainings.length === 1 ? "" : "s"} completed.`
                  : "No CareLearn training has been completed yet."}
              </p>
            </div>
            <div className="rounded-3xl bg-white/60 p-4">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#bc6f55]" />
                <p className="font-bold">Doctor brief</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#746b61]">
                {state.doctorReports.length
                  ? `Latest report covers ${latestDoctorReport?.date_range}.`
                  : "No doctor report has been generated yet."}
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-3xl bg-[#7d6aa8]/10 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#5a4b78]">Wearable health</p>
            <p className="mt-2 text-sm leading-6 text-[#746b61]">
              {health
                ? `${health.steps_today} steps, ${health.active_minutes} active minutes, ${health.latest_heart_rate_bpm ?? "unknown"} bpm. Source: ${health.source}.`
                : "No wearable health snapshot has arrived yet."}
            </p>
          </div>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Open care tasks</p>
          <div className="mt-4 space-y-3">
            {activeTasks.slice(0, 4).map((task) => (
              <div key={task.id} className="rounded-3xl bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{task.task_title}</p>
                  <Badge tone="indigo">{task.assigned_role}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#746b61]">{task.task_steps[0]}</p>
              </div>
            ))}
            {!activeTasks.length && <p className="text-sm text-[#746b61]">No active community tasks right now.</p>}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Active alerts</p>
          <div className="mt-4 space-y-3">
            {activeAlerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-3xl bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{alert.alert_type.replace(/_/g, " ")}</p>
                  <Badge tone={alert.severity === "critical" || alert.severity === "high" ? "danger" : "warn"}>{alert.severity}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#746b61]">{alert.message}</p>
              </div>
            ))}
            {!activeAlerts.length && <p className="text-sm text-[#746b61]">No active alerts right now.</p>}
          </div>
        </Card>
      </section>
    </>
  );

  return (
    <PhoneOrDesktopShell
      mobileTitle="Community"
      mobileEyebrow="CareGrid phone"
      desktop={(children) => <AppShell>{children}</AppShell>}
    >
      {body}
    </PhoneOrDesktopShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9ba66]">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
