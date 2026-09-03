"use client";

import { CheckCircle2, Clock, HeartHandshake, MapPin, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhoneOrDesktopShell } from "@/components/mobile-app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";

export default function CareCirclePage() {
  const { state, updateTask, resolveAlert } = useCareStore();
  const tasks = state.communityTasks;

  const body = (
    <>
      <SectionHeader
        eyebrow="Ring 3 - Community"
        title="CareCircle task flow"
        body="Neighbours, ASHA workers, pharmacy partners, and RWA volunteers see only the instructions and private details they need."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {tasks.length ? (
            tasks.map((task) => (
              <Card key={task.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#6f8b78]/14 text-[#476353]">
                      <HeartHandshake size={20} />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#bc6f55]">{task.assigned_role}</p>
                      <h2 className="font-display text-3xl">{task.task_title}</h2>
                    </div>
                  </div>
                  <Badge tone={task.status === "completed" ? "safe" : task.status === "pending" ? "warn" : "indigo"}>{task.status}</Badge>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#746b61]">
                  Assigned to <strong>{task.assigned_to}</strong>. This view hides unnecessary patient details and focuses on calm response.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {task.task_steps.map((step, index) => (
                    <div key={step} className="rounded-3xl bg-white/52 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">Step {index + 1}</p>
                      <p className="mt-2 font-semibold">{step}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => updateTask(task.id, "accepted")}>
                    <MessageCircle size={16} />
                    Accept
                  </Button>
                  <Button variant="secondary" onClick={() => updateTask(task.id, "reached")}>
                    <MapPin size={16} />
                    Mark reached
                  </Button>
                  <Button
                    onClick={() => {
                      updateTask(task.id, "completed");
                      resolveAlert(task.alert_id);
                    }}
                  >
                    <CheckCircle2 size={16} />
                    Mark safe
                  </Button>
                </div>
              </Card>
            ))
          ) : (
            <Card>
              <h2 className="font-display text-3xl">No active community tasks yet</h2>
              <p className="mt-3 text-sm leading-6 text-[#746b61]">
                Run the SafePath simulation to dispatch Lakshmi as a neighbour helper.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {[
            ["Neighbour", "Speak slowly. Do not argue. Keep away from traffic."],
            ["ASHA worker", "Ask about sleep, hydration, medication, and caregiver stress."],
            ["Pharmacy", "Confirm refill dates. Call caregiver before dispensing if confused."],
            ["RWA volunteer", "Do not crowd. Use masked caregiver call. Mark safe only after confirmation."]
          ].map(([title, copy]) => (
            <Card key={title}>
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-[#bc6f55]" />
                <h3 className="font-display text-2xl">{title} protocol</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#746b61]">{copy}</p>
            </Card>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <PhoneOrDesktopShell
      mobileTitle="Tasks"
      mobileEyebrow="CareCircle"
      desktop={(children) => <AppShell>{children}</AppShell>}
    >
      {body}
    </PhoneOrDesktopShell>
  );
}
