"use client";

import { use, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MapPin, Shield } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LumoLive } from "@/components/lumo-live";
import { Badge, Button, Card } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";

export default function RescuePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = use(params);
  const { state } = useCareStore();
  const patient = state.patients.find((item) => item.id === patientId) || state.patients[0];
  const caregiver = state.caregivers.find((item) => item.patient_id === patient?.id) || state.caregivers[0];
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const notifyCaregiver = async () => {
    setLoading(true);
    setStatus("");
    const location = await readLocation();
    const response = await fetch("/api/sos", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patient?.id,
        type: "bystander_help",
        message: `Bystander opened rescue card for ${patient?.name || "the patient"} and requested caregiver help.`,
        ...(location || {})
      })
    }).then((res) => res.json());
    setLoading(false);
    setStatus(response.message || "Caregiver has been notified.");
  };

  return (
    <AppShell>
      <div className="mx-auto grid max-w-3xl gap-5">
        <Card className="border-[#bc6f55]/30 bg-[#fff8eb]">
          <Badge tone="danger">Emergency help card</Badge>
          <h1 className="mt-4 font-display text-5xl text-[#24201c]">Please help {patient?.name || "this person"} calmly.</h1>
          <p className="mt-4 text-lg leading-8 text-[#746b61]">
            They may be confused or unable to explain where they live. Please keep them away from traffic, speak slowly, and
            notify their caregiver through CareGrid.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <HelpStep icon={<Shield size={18} />} title="Do" copy="Speak slowly. Offer water. Stay nearby until family or a trusted volunteer arrives." />
            <HelpStep icon={<AlertTriangle size={18} />} title="Do not" copy="Do not argue, crowd them, change medicines, or share their private details publicly." />
          </div>
          <Button className="mt-6 w-full justify-center py-4 text-base" onClick={notifyCaregiver} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={18} /> : <MapPin size={18} />}
            Notify caregiver with this location
          </Button>
          {status ? (
            <div className="mt-4 flex items-center gap-2 rounded-3xl bg-[#6f8b78]/12 p-4 text-sm font-semibold text-[#496152]">
              <CheckCircle2 size={18} />
              {status}
            </div>
          ) : null}
        </Card>

        <LumoLive
          compact
          title="Talk to Lumo (any language)"
          subtitle="Bystanders can speak Hindi, Kannada, English, or any language. Lumo replies in the same language with calm instructions — not medical advice."
        />

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Care contact</p>
          <h2 className="mt-2 font-display text-3xl">{caregiver?.name || "Primary caregiver"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#746b61]">
            CareGrid sends the latest GPS coordinates and reason to the configured SOS number. This page does not diagnose
            anything and does not expose private medical records.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}

function HelpStep({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-3xl bg-white/60 p-4">
      <div className="flex items-center gap-2 font-semibold text-[#3f4d7a]">
        {icon}
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#746b61]">{copy}</p>
    </div>
  );
}

function readLocation() {
  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 10000 }
    );
  });
}
