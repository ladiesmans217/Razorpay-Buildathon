"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { Activity, AlertTriangle, BookOpen, HeartPulse, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Timeline } from "@/components/timeline";
import { Badge, Card, MetricCard, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";

const OrientationChart = dynamic(
  () => import("@/components/orientation-chart").then((module) => module.OrientationChart),
  { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-[#746b61]">Loading trend...</div> }
);

export default function CaregiverPage() {
  const { state } = useCareStore();
  const patient = state.patients[0];
  const activeAlerts = state.alerts.filter((alert) => alert.status !== "resolved");
  const health = state.latestHealthSnapshot;
  const risk = activeAlerts.some((alert) => alert.severity === "high" || alert.severity === "critical")
    ? "Elevated"
    : "Calm";

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Ring 2 - Family"
        title="Caregiver Command Center"
        body="A warm operational dashboard for Ananya: latest risk, memory timeline, known people, care tasks, privacy posture, and CareLearn recommendations."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Patient status" value={risk} detail={`${patient.name} is ${activeAlerts.length ? "being checked by CareCircle" : "inside usual routine"}.`} tone={activeAlerts.length ? "warn" : "safe"} />
        <MetricCard label="Medication" value="83%" detail="Weekly adherence from care logs." tone="safe" />
        <MetricCard label="Wandering events" value={String(state.memoryEvents.filter((e) => e.event_type === "safe_zone_exit").length + 1)} detail="Includes simulated current week event." tone="warn" />
        <MetricCard label="Trained helpers" value={String(state.careLearnTrainings.length)} detail="CareLearn completions." tone={state.careLearnTrainings.length ? "safe" : "neutral"} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Active alerts</p>
                <h2 className="mt-1 font-display text-3xl">Risk stays human-readable</h2>
              </div>
              <Badge tone={activeAlerts.length ? "warn" : "safe"}>{activeAlerts.length} active</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {activeAlerts.length ? (
                activeAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-3xl border border-[#bc6f55]/20 bg-[#bc6f55]/10 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-[#bc6f55]" />
                      <p className="font-semibold">{alert.severity.toUpperCase()} - {alert.alert_type.replace(/_/g, " ")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#746b61]">{alert.message}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-[#6f8b78]/20 bg-[#6f8b78]/10 p-4">
                  <p className="font-semibold text-[#476353]">No urgent alert. CareGrid is in awareness mode.</p>
                </div>
              )}
            </div>
          </Card>

          <Timeline events={state.memoryEvents} limit={8} />
        </div>

        <div className="space-y-5">
          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Morning orientation trend</p>
            <div className="mt-4 h-56">
              <OrientationChart />
            </div>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Wearable summary</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white/50 p-3">
                <Activity size={18} className="text-[#3f4d7a]" />
                <p className="mt-2 font-display text-3xl">{health?.steps_today ?? 0}</p>
                <p className="text-xs text-[#746b61]">steps today</p>
              </div>
              <div className="rounded-3xl bg-white/50 p-3">
                <HeartPulse size={18} className="text-[#bc6f55]" />
                <p className="mt-2 font-display text-3xl">{health?.latest_heart_rate_bpm ?? "--"}</p>
                <p className="text-xs text-[#746b61]">latest bpm</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#746b61]">
              {health
                ? `${Math.round((health.sleep_minutes || 0) / 60)}h ${(health.sleep_minutes || 0) % 60}m sleep, ${health.active_minutes} active minutes. Source: ${health.source}${health.mocked_fields.length ? `; demo fields: ${health.mocked_fields.join(", ")}` : ""}.`
                : "No watch health sync yet. Use Sync health on the Galaxy Watch."}
            </p>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Known people</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {state.people.slice(0, 4).map((person) => (
                <div key={person.id} className="rounded-3xl bg-white/50 p-3">
                  <Image src={person.profile_photo_url} alt={person.name} width={96} height={96} className="size-16 rounded-2xl object-cover" />
                  <p className="mt-3 font-semibold">{person.name}</p>
                  <p className="text-xs text-[#746b61]">{person.relation}</p>
                  <Badge className="mt-2" tone={person.trust_level === "primary" ? "safe" : "neutral"}>
                    <UserRoundCheck size={12} />
                    {person.trust_level}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Safe places and CareLearn nudges</p>
            <div className="mt-4 space-y-3">
              {state.places.slice(0, 3).map((place) => (
                <div key={place.id} className="flex items-center gap-3 rounded-3xl bg-white/50 p-3">
                  <MapPin size={18} className={place.safety_level === "safe" ? "text-[#6f8b78]" : "text-[#bc6f55]"} />
                  <div>
                    <p className="font-semibold">{place.name}</p>
                    <p className="text-xs text-[#746b61]">{place.notes}</p>
                  </div>
                </div>
              ))}
              <div className="rounded-3xl bg-[#3f4d7a]/10 p-4">
                <div className="flex items-center gap-2">
                  <BookOpen size={18} className="text-[#3f4d7a]" />
                  <p className="font-semibold">Recommended this week from CareLearn</p>
                </div>
                <p className="mt-2 text-sm text-[#746b61]">Dementia wandering safety, medication routine support, caregiver stress support.</p>
              </div>
              <div className="rounded-3xl bg-[#7d6aa8]/10 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#7d6aa8]" />
                  <p className="font-semibold">Privacy posture</p>
                </div>
                <p className="mt-2 text-sm text-[#746b61]">Unknown faces are not identified. Raw media expires unless caregiver saves it.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
