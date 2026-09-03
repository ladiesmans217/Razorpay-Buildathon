"use client";

import { useMemo, useState } from "react";
import { Award, BookOpen, CheckCircle2, ClipboardList, FileCheck2, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import type { AwarenessEvent, NDLIResource, Role, TrainingCard } from "@/lib/types";
import { DEMO_PATIENT_ID } from "@/lib/seed";
import { uid } from "@/lib/utils";

const roles: Role[] = ["caregiver", "neighbour", "asha", "pharmacy", "rwa", "volunteer"];
const useCases = ["wandering", "medication", "communication", "emergency", "caregiver_stress"];

export default function CareLearnPage() {
  const { state, markNeighbourTrained, addTraining } = useCareStore();
  const [role, setRole] = useState<Role>("neighbour");
  const [useCase, setUseCase] = useState("wandering");
  const [card, setCard] = useState<TrainingCard | null>(null);
  const [eventPlan, setEventPlan] = useState<AwarenessEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);

  const resources = useMemo(
    () =>
      state.ndliResources.filter(
        (resource) => resource.role.includes(role) && (resource.use_case === useCase || resource.use_case === "communication")
      ),
    [role, state.ndliResources, useCase]
  );
  const selectedResource = resources.find((resource) => resource.id === selectedResourceId) || resources[0];
  const lesson = card ? lessonFromCard(card, role, useCase, selectedResource) : selectedResource ? buildFallbackLesson(selectedResource, role, useCase) : null;

  const generateCard = async () => {
    setLoading(true);
    try {
      const data = (await fetch("/api/carelearn/generate-training-card", {
        method: "POST",
        body: JSON.stringify({
          role,
          use_case: useCase,
          event_context: "Rajamma had a safe-zone exit near MSRIT gate and a neighbour was notified."
        })
      }).then((res) => res.json())) as TrainingCard;
      setCard(data);
    } finally {
      setLoading(false);
    }
  };

  const generateEvent = async () => {
    setLoading(true);
    try {
      const data = (await fetch("/api/carelearn/generate-awareness-event", {
        method: "POST",
        body: JSON.stringify({
          recent_events: state.memoryEvents
            .slice(0, 5)
            .map((event) => event.summary)
            .join("\n")
        })
      }).then((res) => res.json())) as AwarenessEvent;
      setEventPlan(data);
    } finally {
      setLoading(false);
    }
  };

  const completeLesson = (resource: NDLIResource) => {
    if (completedLessons.includes(resource.id)) return;
    setCompletedLessons((current) => [...current, resource.id]);
    const cardText =
      card?.role_specific_card ||
      `Completed CareLearn lesson: ${resource.title}. Role: ${role}. Use case: ${useCase}.`;
    addTraining({
      id: uid("training"),
      patient_id: DEMO_PATIENT_ID,
      role,
      resource_ids: [resource.id],
      generated_card: cardText,
      quiz_score: 5,
      completed_by: role === "neighbour" ? "Lakshmi" : role === "asha" ? "Meena" : role === "pharmacy" ? "Ravi" : "CareCircle member",
      completed_at: new Date().toISOString(),
      event_context: `${useCase} CareLearn lesson completion`
    });
  };

  const learningTopics = (eventPlan?.learning_topics || eventPlan?.ndli_search_topics || []).filter(Boolean);
  const cardTopics = (card?.learning_topics || card?.ndli_queries || card?.resource_topics || []).filter(Boolean);

  return (
    <AppShell>
      <SectionHeader
        eyebrow="CareLearn · Gemini-generated"
        title="Train the community around the patient"
        body="CareLearn builds role-specific lessons, quizzes, and RWA awareness sessions with Gemini — practical care skills for Indian families and neighbours."
      />
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Training generator</p>
          <label className="mt-5 block text-sm font-bold text-[#746b61]">Role</label>
          <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="mt-2 w-full rounded-2xl border border-[#24201c]/10 bg-white/70 p-3 font-semibold outline-none">
            {roles.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="mt-4 block text-sm font-bold text-[#746b61]">Use case</label>
          <select value={useCase} onChange={(event) => setUseCase(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#24201c]/10 bg-white/70 p-3 font-semibold outline-none">
            {useCases.map((item) => (
              <option key={item} value={item}>
                {item.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <div className="mt-5 flex flex-col gap-3">
            <Button onClick={generateCard} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Generate CareLearn card
            </Button>
            <Button variant="secondary" onClick={generateEvent} disabled={loading}>
              <Award size={16} />
              Create RWA awareness session
            </Button>
            <Button variant="secondary" onClick={() => card && markNeighbourTrained(card)} disabled={!card}>
              <CheckCircle2 size={16} />
              Mark neighbour trained (+120 pts)
            </Button>
          </div>
          <p className="mt-4 text-xs leading-5 text-[#746b61]">
            Completing lessons earns CareLearn points, badges, and care streaks in the reward wallet.
          </p>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">CareLearn topic packs</p>
                <h2 className="mt-1 font-display text-3xl">
                  {role} / {useCase.replace(/_/g, " ")}
                </h2>
              </div>
              <Badge tone="indigo">Gemini + seeded packs</Badge>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {resources.map((resource) => (
                <div key={resource.id} className="rounded-3xl border border-[#24201c]/10 bg-white/52 p-4">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-[#3f4d7a]" />
                    <p className="font-semibold">{resource.title}</p>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[#746b61]">{resource.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="rounded-full bg-[#3f4d7a] px-4 py-2 text-xs font-bold text-[#fff8eb]" onClick={() => setSelectedResourceId(resource.id)}>
                      <PlayCircle size={13} className="mr-1 inline" />
                      Open pack
                    </button>
                    <button
                      className="rounded-full bg-[#24201c] px-4 py-2 text-xs font-bold text-[#fff8eb]"
                      onClick={() => {
                        setSelectedResourceId(resource.id);
                        void generateCard();
                      }}
                    >
                      <Sparkles size={13} className="mr-1 inline" />
                      Generate with Gemini
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {lesson && selectedResource && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">In-app CareLearn lesson</p>
                  <h2 className="mt-1 font-display text-3xl">{selectedResource.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#746b61]">
                    {card ? "Lesson steps generated by Gemini CareLearn for this role and use case." : "Starter pack ready. Generate with Gemini for a full custom card and quiz."}
                  </p>
                </div>
                <Badge tone={completedLessons.includes(selectedResource.id) ? "safe" : "indigo"}>
                  {completedLessons.includes(selectedResource.id) ? "completed" : "lesson mode"}
                </Badge>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <LessonBlock title="Learn" items={lesson.learn} />
                <LessonBlock title="Do" items={lesson.do} />
                <LessonBlock title="Do not" items={lesson.doNot} />
              </div>
              <div className="mt-4 rounded-3xl bg-[#6f8b78]/10 p-4">
                <p className="font-semibold text-[#476353]">Practice scenario</p>
                <p className="mt-2 text-sm leading-6 text-[#476353]">{lesson.scenario}</p>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {lesson.quiz.map((question, index) => (
                  <div key={question} className="rounded-3xl bg-white/52 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">Check {index + 1}</p>
                    <p className="mt-2 font-semibold">{question}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button onClick={() => completeLesson(selectedResource)}>
                  <FileCheck2 size={16} />
                  Complete lesson (+120 pts)
                </Button>
              </div>
            </Card>
          )}

          {card && (
            <Card>
              <div className="flex items-center gap-3">
                <ClipboardList size={20} className="text-[#bc6f55]" />
                <h2 className="font-display text-3xl">Gemini CareLearn card</h2>
              </div>
              {cardTopics.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {cardTopics.map((topic) => (
                    <Badge key={topic} tone="indigo">
                      {topic}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <pre className="mt-5 whitespace-pre-wrap rounded-3xl bg-[#24201c] p-5 text-sm leading-6 text-[#fff8eb]">{card.role_specific_card}</pre>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {card.quiz_questions.map((question, index) => (
                  <div key={question} className="rounded-3xl bg-white/52 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">Question {index + 1}</p>
                    <p className="mt-2 font-semibold">{question}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {eventPlan && (
            <Card>
              <Badge tone="warn">RWA awareness session</Badge>
              <h2 className="mt-3 font-display text-4xl">{eventPlan.title}</h2>
              <p className="mt-2 text-sm font-semibold text-[#746b61]">
                {eventPlan.duration} - {eventPlan.audience}
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <List title="Agenda" items={eventPlan.agenda} />
                <List title="Volunteer checklist" items={eventPlan.volunteer_checklist} />
                <List title="Learning topics" items={learningTopics} />
                <List title="Quiz" items={eventPlan.quiz_questions} />
              </div>
              <p className="mt-5 rounded-3xl bg-[#7d6aa8]/10 p-4 text-sm leading-6 text-[#5a4b78]">{eventPlan.roleplay_activity}</p>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function LessonBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-white/52 p-4">
      <p className="font-display text-2xl">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-[#746b61]">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl bg-white/52 p-4">
      <p className="font-display text-2xl">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-5 text-[#746b61]">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function lessonFromCard(card: TrainingCard, role: Role, useCase: string, resource?: NDLIResource) {
  return {
    learn: card.learn_steps?.length ? card.learn_steps : [resource?.summary || "CareLearn pack", ...(card.resource_topics || []).slice(0, 2)],
    do: card.do_steps?.length
      ? card.do_steps
      : buildFallbackLesson(resource || fallbackResource(role, useCase), role, useCase).do,
    doNot: card.do_not_steps?.length
      ? card.do_not_steps
      : ["Do not argue or test memory.", "Do not invent diagnoses.", "Do not share private medical details publicly."],
    scenario: card.scenario || buildFallbackLesson(resource || fallbackResource(role, useCase), role, useCase).scenario,
    quiz: card.quiz_questions
  };
}

function buildFallbackLesson(resource: NDLIResource, role: Role, useCase: string) {
  const roleName = role === "rwa" ? "RWA volunteer" : role;
  const wandering = useCase === "wandering";
  const medication = useCase === "medication";
  return {
    learn: [
      resource.summary,
      `CareLearn topic: "${resource.title}".`,
      `This lesson is for a ${roleName} supporting Rajamma's care circle.`
    ],
    do: wandering
      ? ["Approach from the front and use Rajamma's name.", "Move slowly toward a safe, quiet place.", "Notify the caregiver before sharing details with others."]
      : medication
        ? ["Confirm refill date with caregiver.", "Record repeated medicine requests as a care note.", "Escalate sudden confusion to caregiver or ASHA worker."]
        : ["Speak slowly and give one instruction at a time.", "Offer water or a calm place to sit.", "Use the CareCircle task flow instead of crowding the patient."],
    doNot: ["Do not argue or test memory.", "Do not identify unknown strangers.", "Do not share private medical details outside the approved care circle."],
    scenario: wandering
      ? "Rajamma is near the temple gate and seems unsure where to go. Practice one calm sentence, one safety action, and one caregiver notification."
      : "A care circle member notices a routine change. Practice documenting only the useful observation and escalating without making a diagnosis.",
    quiz: [
      "Should you argue with a confused dementia patient?",
      "Who should be notified first in a non-emergency?",
      "Should private medical details be posted in an apartment group?",
      "What is one calm phrase you can use?",
      "When should the care circle escalate?"
    ]
  };
}

function fallbackResource(role: Role, useCase: string): NDLIResource {
  return {
    id: "carelearn_fallback",
    title: "CareLearn starter pack",
    query: useCase,
    role: [role],
    use_case: useCase,
    language: ["English"],
    ndli_search_url: "",
    summary: "Gemini will expand this into a full CareLearn card.",
    generated_training_card: "",
    quiz_questions: [],
    source_type: "carelearn"
  };
}
