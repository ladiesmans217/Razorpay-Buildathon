"use client";

import { useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";
import { jsPDF } from "jspdf";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import type { DoctorReport } from "@/lib/types";

export default function DoctorReportPage() {
  const { state, addDoctorReport } = useCareStore();
  const [report, setReport] = useState<DoctorReport | null>(state.doctorReports[0] || null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const data = createMockDoctorReport(state.patients[0]?.id || "patient_rajamma");
    setReport(data);
    addDoctorReport(data);
    setLoading(false);
  };

  const exportPdf = () => {
    if (!report) return;
    const health = state.latestHealthSnapshot;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("RememberMe CareGrid - Doctor Brief", 14, 18);
    doc.setFontSize(10);
    const text = [
      `Patient: ${state.patients[0].name}`,
      `Date range: ${report.date_range}`,
      `Medication adherence: ${report.medication_adherence}`,
      `Wandering events: ${report.wandering_events}`,
      `Night exits: ${report.night_exits}`,
      `Known visitors: ${report.known_visitors}`,
      `Memory topics: ${report.memory_journal_topics.join(", ")}`,
      `Caregiver notes: ${report.caregiver_notes}`,
      `ASHA notes: ${report.asha_notes}`,
      health
        ? `Wearable summary: ${health.steps_today} steps, ${health.active_minutes} active minutes, ${health.sleep_minutes ?? "unknown"} sleep minutes, source ${health.source}. Demo fields: ${health.mocked_fields.join(", ") || "none"}`
        : "Wearable summary: no sync yet",
      `Recommendations: ${report.carelearn_recommendations.join(", ")}`,
      `Discussion points: ${report.suggested_discussion_points.join(", ")}`,
      `Disclaimer: ${report.disclaimer}`
    ].join("\n\n");
    doc.text(doc.splitTextToSize(text, 180), 14, 32);
    doc.save("rememberme-doctor-brief.pdf");
  };

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Doctor Brief"
        title="Weekly neurologist summary"
        body="A structured report for doctor visits generated from caregiver and device logs. It never diagnoses."
        action={
          <Button onClick={generateReport} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            Generate report
          </Button>
        }
      />
      {report ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge tone="privacy">not a medical diagnosis</Badge>
              <h2 className="mt-3 font-display text-5xl">Weekly Neurologist Summary</h2>
              <p className="mt-2 text-[#746b61]">Patient: {state.patients[0].name} - Week: {report.date_range}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer size={16} />
                Print
              </Button>
              <Button variant="secondary" onClick={exportPdf}>
                <Download size={16} />
                PDF
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Brief label="Medication adherence" value={report.medication_adherence} />
            <Brief label="Wandering events" value={String(report.wandering_events)} />
            <Brief label="Night exits" value={String(report.night_exits)} />
            <Brief label="Known visitors" value={String(report.known_visitors)} />
            <Brief label="Unknown visitor alerts" value={String(report.unknown_visitors)} />
            <Brief label="Safe place visits" value={String(report.safe_place_visits)} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Panel title="Generated summary" items={[report.generated_summary]} />
            <Panel title="Memory journal topics" items={report.memory_journal_topics} />
            <Panel title="Caregiver notes" items={[report.caregiver_notes, report.mood_notes]} />
            <Panel title="ASHA and pharmacy notes" items={[report.asha_notes, report.pharmacy_notes]} />
            <Panel
              title="Wearable summary"
              items={
                state.latestHealthSnapshot
                  ? [
                      `${state.latestHealthSnapshot.steps_today} steps today, ${state.latestHealthSnapshot.active_minutes} active minutes, ${state.latestHealthSnapshot.sleep_minutes ?? "unknown"} sleep minutes.`,
                      `Source: ${state.latestHealthSnapshot.source}. Demo fields: ${state.latestHealthSnapshot.mocked_fields.join(", ") || "none"}.`
                    ]
                  : ["No Galaxy Watch health sync yet."]
              }
            />
            <Panel title="CareLearn recommendations" items={report.carelearn_recommendations} />
            <Panel title="Suggested doctor discussion" items={report.suggested_discussion_points} />
          </div>

          <div className="mt-5 rounded-3xl bg-[#bc6f55]/12 p-4 text-sm font-semibold leading-6 text-[#914d3c]">
            {report.disclaimer}
          </div>
        </Card>
      ) : (
        <Card>
          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <div className="rounded-full bg-[#24201c] p-5 text-[#fff8eb] shadow-xl">
                <Loader2 className="animate-spin" size={32} />
              </div>
              <h2 className="mt-6 font-display text-4xl">Preparing doctor brief</h2>
              <p className="mt-3 max-w-xl text-[#746b61]">
                Collecting care timeline, SafePath alerts, wearable notes, and CareLearn recommendations for Rajamma.
              </p>
            </div>
          ) : (
            <>
              <h2 className="font-display text-4xl">No report generated yet</h2>
              <p className="mt-3 text-[#746b61]">Generate the weekly brief after running SmritiLens, SafePath, CareCircle, and CareLearn.</p>
            </>
          )}
        </Card>
      )}
    </AppShell>
  );
}

function createMockDoctorReport(patientId: string): DoctorReport {
  return {
    id: `doctor_report_demo_${Date.now()}`,
    patient_id: patientId,
    date_range: "September 1 to September 4, 2026",
    medication_adherence: "83%",
    wandering_events: 2,
    night_exits: 1,
    safe_place_visits: 5,
    known_visitors: 4,
    unknown_visitors: 1,
    memory_journal_topics: ["Mysore trip with husband", "Wedding saree", "Temple visit", "Lunch and medicine reminder"],
    mood_notes: "Mostly calm. Mild confusion was observed after poor sleep and during one safe-zone exit.",
    caregiver_notes: "Ananya reports more confusion after disturbed sleep. Rajamma responded well to short Lumo cues and familiar-person reminders.",
    asha_notes: "ASHA worker recommends checking sleep, hydration, medicine routine, and caregiver stress during the next visit.",
    pharmacy_notes: "Monthly refill due Monday. Pharmacy partner should confirm delivery with caregiver before dispensing any repeated medicine requests.",
    carelearn_recommendations: [
      "Dementia wandering safety",
      "Calm communication with dementia patients",
      "Medication routine support",
      "Caregiver stress management"
    ],
    suggested_discussion_points: [
      "Discuss sleep disturbance and night exit risk.",
      "Review medication timing and missed-dose routine.",
      "Ask whether recent confusion could be linked to illness, dehydration, or poor sleep.",
      "Review safe walking plan and caregiver escalation protocol."
    ],
    generated_summary:
      "This week, Rajamma had two wandering-risk events, one night exit, and one unknown visitor alert. Known social interactions were calm, especially with trusted people in the care circle. The main caregiver concern is increased confusion after poor sleep. SafePath and CareCircle helped resolve the latest outdoor event without escalation.",
    disclaimer:
      "This report is generated from caregiver, watch, and device logs for discussion support only. It is not a medical diagnosis or disease progression prediction.",
    created_at: new Date().toISOString()
  };
}

function Brief({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/52 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-[#24201c]/10 bg-white/48 p-5">
      <p className="font-display text-2xl">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[#746b61]">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}
