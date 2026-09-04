"use client";

import { AppShell } from "@/components/app-shell";
import { SmritiLens } from "@/components/smriti-lens";
import { SectionHeader } from "@/components/ui";

export default function LensPage() {
  return (
    <AppShell>
      <SectionHeader
        eyebrow="SmritiLens"
        title="Consent-aware recognition"
        body="Recognize only enrolled trusted people, retrieve recent care context, generate Lumo cues, and preserve privacy for unknown faces."
      />
      <SmritiLens />
    </AppShell>
  );
}
