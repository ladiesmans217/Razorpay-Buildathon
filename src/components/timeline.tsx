"use client";

import { Camera, Clock, MapPin, Shield } from "lucide-react";
import type { MemoryEvent } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";

const eventLabels: Record<string, string> = {
  person_seen: "Person seen",
  conversation: "Conversation",
  memory_journal: "Memory journal",
  medication_taken: "Medicine taken",
  medication_missed: "Medicine missed",
  safe_zone_exit: "Safe-zone exit",
  safe_place_visit: "Safe place",
  risky_place_entry: "Risky place",
  unknown_person_detected: "Unknown person",
  asha_visit: "ASHA visit",
  pharmacy_delivery: "Pharmacy",
  caregiver_checkin: "Caregiver",
  neighbour_help: "Neighbour help",
  rwa_response: "RWA response",
  doctor_note: "Doctor note",
  carelearn_training_completed: "CareLearn",
  orientation_check: "Orientation"
};

export function Timeline({ events, limit = 8 }: { events: MemoryEvent[]; limit?: number }) {
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-[#24201c]/10 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Memory timeline</p>
          <h2 className="mt-1 font-display text-2xl">Consent-aware events</h2>
        </div>
        <Badge tone="privacy">not continuous surveillance</Badge>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto p-5 scrollbar-soft">
        {events.slice(0, limit).map((event) => (
          <article key={event.id} className="rounded-3xl border border-[#24201c]/10 bg-white/48 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={event.risk_score > 60 ? "danger" : event.risk_score > 20 ? "warn" : "safe"}>
                {eventLabels[event.event_type] || event.event_type}
              </Badge>
              <Badge tone="privacy">
                <Shield size={12} />
                {event.privacy_level}
              </Badge>
              <Badge tone="neutral">{event.retention_policy}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#24201c]">{event.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[#746b61]">
              <span className="inline-flex items-center gap-1">
                <Clock size={13} />
                {formatDate(event.timestamp)}, {formatTime(event.timestamp)}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} />
                {event.location}
              </span>
              <span className="inline-flex items-center gap-1">
                <Camera size={13} />
                {event.source}
              </span>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}
