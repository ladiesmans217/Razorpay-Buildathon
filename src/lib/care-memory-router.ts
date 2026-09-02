import { generateGroundedJson } from "@/lib/ai/gemini";
import { generateJson } from "@/lib/ai/provider";
import type {
  AlertSeverity,
  CareState,
  HealthSnapshot,
  MemoryEvent,
  PersonProfile,
  WatchCue,
  WatchTalkResponse
} from "@/lib/types";

export type CareMemoryAnswer = WatchTalkResponse & {
  citations?: string[];
  retrieved_context?: string;
};

const fallbackAnswer: CareMemoryAnswer = {
  reply: "I am here with you. Please ask me one thing at a time, like who is this, where am I, or call Ananya.",
  intent: "general",
  risk_level: "low",
  action: "answer_only",
  should_end_session: false
};

export async function routeCareMemoryQuestion(input: {
  transcript: string;
  state: CareState;
  cue: WatchCue;
}): Promise<CareMemoryAnswer & { _mock?: boolean }> {
  const transcript = input.transcript.trim();
  const text = normalize(transcript);
  const { state, cue } = input;

  const deterministic = deterministicCareAnswer(text, transcript, state, cue);
  if (deterministic) return deterministic;

  if (isPublicSearchQuestion(text)) {
    return groundedPublicAnswer(transcript);
  }

  return generateCareFallback(transcript, state, cue);
}

function deterministicCareAnswer(text: string, transcript: string, state: CareState, cue: WatchCue): CareMemoryAnswer | null {
  const patient = state.patients[0];
  const caregiver = state.caregivers[0];
  const activeCapture = latestActiveCaptureSession(state);

  if (activeCapture) {
    const captureResponse = activeCaptureAnswer(text, transcript, activeCapture);
    if (captureResponse) return captureResponse;
  }

  if (/\b(stop|end|cancel|enough|bye|stop talking)\b/.test(text)) {
    return answer("Okay. I will stop listening now. I am still here if you tap Talk to Lumo again.", "stop", "low", "end_session", true);
  }

  if (/\b(who are you|what are you|what is your name|whats your name|your name|who is lumo|are you lumo|who are u)\b/.test(text)) {
    return answer(
      "I am Lumo, the calm care companion on your watch. I can remind you about people, places, routines, and call Ananya if you need help.",
      "lumo_identity"
    );
  }

  if (/\b(who am i|what is my name|whats my name|my name|do you know me)\b/.test(text)) {
    return answer(
      `You are ${patient?.name || "Rajamma"}. Your care notes say you live with mild dementia, so it is okay to feel unsure. I am here with you, and I am quietly letting ${caregiver?.name || "Ananya"} know.`,
      "patient_identity",
      "medium",
      "notify_caregiver"
    );
  }

  if (isPublicSearchQuestion(text)) return null;

  if (isCaregiverAction(text)) {
    return answer(
      `Okay, I am notifying ${caregiver?.name || "Ananya"} now. Please stay where you are and do not cross the road.`,
      "caregiver_action",
      "high",
      "notify_caregiver"
    );
  }

  const namedPerson = findNamedPerson(transcript, state);
  if (namedPerson && isPersonLookup(text)) {
    return answer(personLookupReply(namedPerson, state), "person_lookup", "low", "answer_only", false, contextForPerson(namedPerson, state));
  }

  if (isFrontPersonQuestion(text)) {
    return answer(
      "I will check who is in front of you. Keep the CareGrid phone on Guard with the camera pointed calmly; if it asks, tap Capture photo now.",
      "front_camera_identification",
      "low",
      "request_camera_frame"
    );
  }

  if (/\b(who is this|whos this|who is that|whos that|who is he|whos he|who is she|whos she|who are they|person here|person in front|standing here|this man|this woman|this person|face)\b/.test(text)) {
    return answer(recognizedPersonReply(cue), "recognized_person");
  }

  if (isMedicationQuestion(text)) {
    return answer(medicationReply(state), "medicine");
  }

  if (isHealthQuestion(text)) {
    return answer(healthReply(state.latestHealthSnapshot), "health_summary", "low", "answer_only", false, JSON.stringify(state.latestHealthSnapshot || null));
  }

  if (isCareLearnQuestion(text)) {
    return answer(careLearnReply(text, state), "carelearn_learning", "low", "answer_only", false, JSON.stringify(state.ndliResources.slice(0, 5)));
  }

  if (isDoctorQuestion(text)) {
    return answer(doctorBriefReply(state), "doctor_brief");
  }

  if (/\b(i am lost|im lost|lost|cannot find home|cant find home|where is home|take me home)\b/.test(text)) {
    return answer("It is okay, I am notifying Ananya now. Please stay where you are and do not cross the road.", "caregiver_alert", "high", "notify_caregiver");
  }

  if (isLocationQuestion(text)) {
    return answer(locationReply(state), "location_safety", activeRisk(state));
  }

  if (isRoutineQuestion(text)) {
    return answer(routineReply(state), "routine");
  }

  if (isRecentMemoryQuestion(text)) {
    return answer(recentMemoryReply(state), "recent_memory");
  }

  if (/\b(i forgot|i forget|forgot something|cannot remember|cant remember|do not remember|dont remember|confused|i am confused|im confused|scared|afraid|what is happening|what happened to me)\b/.test(text)) {
    return answer(
      `That is okay, ${patient?.name || "Rajamma"}. Your care notes say you have mild dementia, so moments of forgetting can happen. Please breathe slowly; I am here with you, and I am quietly letting ${caregiver?.name || "Ananya"} know.`,
      "confusion",
      "medium",
      "notify_caregiver"
    );
  }

  return null;
}

function answer(
  reply: string,
  intent: CareMemoryAnswer["intent"],
  risk_level: AlertSeverity = "low",
  action: CareMemoryAnswer["action"] = "answer_only",
  should_end_session = false,
  retrieved_context?: string
): CareMemoryAnswer {
  return { reply: short(reply), intent, risk_level, action, should_end_session, retrieved_context };
}

function captureAnswer(
  reply: string,
  update: NonNullable<CareMemoryAnswer["capture_update"]>,
  action: CareMemoryAnswer["action"] = "start_capture_session"
): CareMemoryAnswer {
  return {
    reply: short(reply),
    intent: update.kind === "complete" ? "capture_stop" : "ambient_capture_consent",
    risk_level: "low",
    action,
    should_end_session: false,
    capture_update: update
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function latestActiveCaptureSession(state: CareState) {
  return [...(state.captureSessions || [])]
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .find((session) => !["saved", "declined", "cancelled"].includes(session.status));
}

function activeCaptureAnswer(text: string, transcript: string, session: NonNullable<ReturnType<typeof latestActiveCaptureSession>>) {
  if (/\b(cancel|stop saving|do not save|dont save|forget this)\b/.test(text)) {
    return captureAnswer(
      "Okay. I will not save this memory.",
      { kind: "cancel", accepted: false },
      "stop_capture_session"
    );
  }

  if (session.status === "ask_save_name") {
    if (isNegative(text)) {
      return captureAnswer("Okay. I will not save this person.", { kind: "name", accepted: false }, "stop_capture_session");
    }
    const name = extractSpokenName(transcript);
    if (name) {
      return captureAnswer(
        `Thank you. I saved the name ${name}. May I capture one photo with permission?`,
        { kind: "name", accepted: true, person_name: name, person_description: extractDescription(transcript, name) }
      );
    }
    if (isAffirmative(text)) {
      return answer("Okay. Please say the person’s name slowly, for example: his name is Rahul.", "ambient_capture_consent");
    }
  }

  if (session.status === "ask_photo_consent") {
    if (isAffirmative(text)) {
      return captureAnswer(
        "Okay. I will ask the phone camera to capture one photo. Would you also like me to save the conversation transcript?",
        { kind: "photo", accepted: true },
        "request_camera_frame"
      );
    }
    if (isNegative(text)) {
      return captureAnswer(
        "Okay, no photo will be saved. Would you like me to save only the conversation transcript?",
        { kind: "photo", accepted: false }
      );
    }
  }

  if (session.status === "ask_transcript_consent") {
    if (isAffirmative(text) || /\b(start transcript|save transcript|record conversation)\b/.test(text)) {
      return captureAnswer(
        "Okay. I will save the conversation transcript now. Say conversation ended when I should stop.",
        { kind: "transcript", accepted: true }
      );
    }
    if (isNegative(text)) {
      return captureAnswer(
        "Okay. I will not save the transcript. I can still keep the consented name.",
        { kind: "transcript", accepted: false }
      );
    }
  }

  if (session.status === "recording" && /\b(conversation ended|conversation has ended|stop transcript|stop recording|end conversation)\b/.test(text)) {
    return captureAnswer(
      "Okay. I will stop saving the transcript and prepare a short memory summary.",
      { kind: "complete", accepted: true },
      "stop_capture_session"
    );
  }

  return null;
}

function isAffirmative(text: string) {
  return /\b(yes|yeah|yep|okay|ok|sure|save it|do it|please do)\b/.test(text);
}

function isNegative(text: string) {
  return /\b(no|nope|dont|do not|not now|skip|decline)\b/.test(text);
}

function extractSpokenName(transcript: string) {
  const match =
    transcript.match(/\b(?:his|her|their|the|this person'?s?)?\s*name\s+is\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/) ||
    transcript.match(/\b(?:this is|he is|she is|they are)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  return match?.[1]?.trim();
}

function extractDescription(transcript: string, name: string) {
  const cleaned = transcript.replace(name, "").trim();
  const relation = cleaned.match(/\b(friend|neighbour|neighbor|brother|sister|son|daughter|doctor|asha worker|pharmacy owner|teacher)\b/i)?.[1];
  return relation || "";
}

function isCaregiverAction(text: string) {
  return /\b(call|notify|contact|phone|alert|help)\b/.test(text) && /\b(ananya|caregiver|daughter|family|help)\b/.test(text);
}

function isFrontPersonQuestion(text: string) {
  const asksIdentity = /\b(who|whos|who is|identify|recognize|check|see|tell me)\b/.test(text);
  const nearbyPerson =
    /\b(in front|front of me|front of you|ahead of me|ahead of you|standing in front|standing here|beside me|near me|nearby|with me|before me)\b/.test(text) ||
    /\b(this person|that person|this man|that man|this woman|that woman|this face|the person)\b/.test(text);
  return asksIdentity && nearbyPerson;
}

function isPersonLookup(text: string) {
  return /\b(who is|who are|whos|tell me about|do i know|how do i know|what did i talk|when did i meet|remember)\b/.test(text);
}

function isMedicationQuestion(text: string) {
  return /\b(medicine|tablet|pill|dose|medication|drug|took|taken)\b/.test(text);
}

function isHealthQuestion(text: string) {
  return /\b(sleep|slept|walk|walked|steps|step count|heart|pulse|calorie|calories|active minutes|activity|running|ran|health|bp|blood pressure|ecg)\b/.test(text);
}

function isCareLearnQuestion(text: string) {
  return /\b(learn|learning|lesson|training|carelearn|what should.*learn|teach|resource|quiz)\b/.test(text);
}

function isDoctorQuestion(text: string) {
  return /\b(doctor|report|brief|neurologist|summary|clinic|dr nair)\b/.test(text);
}

function isLocationQuestion(text: string) {
  return /\b(where|location|place|home|safe zone|safe place|outside|road|temple|pharmacy)\b/.test(text);
}

function isRoutineQuestion(text: string) {
  return /\b(today|schedule|routine|breakfast|lunch|dinner|visit|visiting|coming|plan)\b/.test(text);
}

function isRecentMemoryQuestion(text: string) {
  return /\b(what happened|yesterday|this morning|last night|what did i do|who came|who visited|did i meet|conversation|talked|spoke|i just woke up)\b/.test(text);
}

function isPublicSearchQuestion(text: string) {
  return /\b(news|current affairs|weather in|search web|google|internet)\b/.test(text) || /\blatest\b.*\b(news|guidance|research|update|updates)\b/.test(text);
}

function findNamedPerson(transcript: string, state: CareState): PersonProfile | { name: string; relation: string; role: string; memory_note: string; last_seen_at?: string; last_seen_location?: string; last_conversation_summary?: string } | null {
  const text = normalize(transcript);
  const people = [
    ...state.caregivers.map((caregiver) => ({
      name: caregiver.name,
      relation: caregiver.relation,
      role: "caregiver",
      memory_note: `${caregiver.name} is the primary ${caregiver.relation} and care contact.`,
      last_seen_at: "",
      last_seen_location: "",
      last_conversation_summary: `${caregiver.name} receives watch and dashboard notifications.`
    })),
    ...state.people
  ];
  return people.find((person) => text.includes(normalize(person.name))) || null;
}

function personLookupReply(person: ReturnType<typeof findNamedPerson>, state: CareState) {
  if (!person) return "I do not have that person in your care circle yet.";
  const relatedEvents = eventsForPerson(person.name, state).slice(0, 2);
  const profile = state.people.find((item) => normalize(item.name) === normalize(person.name));
  const baseRelation = person.relation.charAt(0).toLowerCase() + person.relation.slice(1);
  const relation = profile?.role === "family" || person.role === "caregiver" ? `${baseRelation} and care contact` : baseRelation;
  const lastSeen = profile?.last_seen_location || person.last_seen_location;
  const lastTalk = profile?.last_conversation_summary || person.last_conversation_summary;
  const memoryNote = profile?.memory_note || person.memory_note;
  const eventNote = relatedEvents.length ? ` Recent memory: ${relatedEvents[0].summary}` : "";
  return [
    `${person.name} is your ${relation}.`,
    asSentence(memoryNote),
    lastSeen ? `Last seen near ${lastSeen}.` : "",
    lastTalk ? `Last note: ${lastTalk}` : eventNote
  ]
    .filter(Boolean)
    .join(" ");
}

function contextForPerson(person: NonNullable<ReturnType<typeof findNamedPerson>>, state: CareState) {
  const { face_embedding: _faceEmbedding, ...safePerson } = person as PersonProfile & Record<string, unknown>;
  return JSON.stringify({
    person: {
      ...safePerson,
      has_face_embedding: Array.isArray(_faceEmbedding) && _faceEmbedding.length > 0
    },
    related_events: eventsForPerson(person.name, state).slice(0, 5)
  });
}

function eventsForPerson(name: string, state: CareState) {
  const target = normalize(name);
  return [...state.memoryEvents]
    .sort(byNewest)
    .filter((event) => event.people_involved.some((person) => normalize(person).includes(target) || target.includes(normalize(person))) || normalize(event.summary).includes(target));
}

function recognizedPersonReply(cue: WatchCue) {
  if (cue.source_event === "person_recognition" && cue.person_name) return cue.cue;
  return "I do not see an enrolled trusted person right now. If you feel unsure, stay near a familiar place and I can contact Ananya.";
}

function medicationReply(state: CareState) {
  const patient = state.patients[0];
  const latestMedication = [...state.memoryEvents].sort(byNewest).find((event) => event.event_type.startsWith("medication"));
  const schedule = patient?.medication_schedule?.join(". ") || "Your caregiver can confirm the medicine routine.";
  if (latestMedication) return `${latestMedication.summary} Your routine says: ${schedule}.`;
  return `Your routine says: ${schedule}. Please confirm with Ananya before changing anything.`;
}

function healthReply(snapshot?: HealthSnapshot) {
  if (!snapshot) return "I do not have a watch health sync yet. You can tap Sync health on the watch.";
  const source = snapshot.source === "mixed" ? "Some values are live and some are demo for the buildathon." : snapshot.source === "demo" ? "These are demo values." : "These are from the watch.";
  const sleep = snapshot.sleep_minutes ? `${Math.round(snapshot.sleep_minutes / 60)} hours ${snapshot.sleep_minutes % 60} minutes of sleep` : "sleep not available";
  const heart = snapshot.latest_heart_rate_bpm ? ` Latest heart rate is ${snapshot.latest_heart_rate_bpm}.` : "";
  const distance = snapshot.distance_m ? `, about ${Math.round(snapshot.distance_m / 100) * 100} metres` : "";
  return `Today shows ${snapshot.steps_today} steps${distance}, ${snapshot.active_minutes} active minutes, and ${sleep}. ${source}${heart}`;
}

function careLearnReply(text: string, state: CareState) {
  const wandering = state.alerts.some((alert) => alert.alert_type === "safe_zone_exit") || text.includes("wander");
  const med = text.includes("medicine") || text.includes("pharmacy");
  const resource =
    state.ndliResources.find((item) => wandering && item.use_case === "wandering") ||
    state.ndliResources.find((item) => med && item.use_case === "medication") ||
    state.ndliResources[0];
  if (!resource) return "I do not have a CareLearn topic ready yet. Open CareLearn to generate one with Gemini.";
  return `Today’s CareLearn topic is ${resource.title}. Practice theme: ${resource.query}.`;
}

function doctorBriefReply(state: CareState) {
  const report = [...state.doctorReports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const health = state.latestHealthSnapshot ? ` Latest wearable note: ${healthReply(state.latestHealthSnapshot)}` : "";
  if (report) return `${report.generated_summary} Suggested discussion: ${report.suggested_discussion_points[0] || "review sleep, wandering, and medication routine."}${health}`;
  return `No doctor brief has been generated yet. I can still summarize recent care events: ${recentMemoryReply(state)}${health}`;
}

function locationReply(state: CareState) {
  const alert = state.alerts.find((item) => item.status === "pending" && item.alert_type !== "emergency");
  if (alert) return `${alert.message} Please stay near a familiar place while the care circle responds.`;
  const location = state.latestLocation;
  if (location) return `Your last CareGrid location is recorded from ${location.source}. Please stay near a familiar place if you feel unsure.`;
  return "I do not have a fresh location yet. You can tap Send GPS on the watch.";
}

function routineReply(state: CareState) {
  const patient = state.patients[0];
  const caregiver = state.caregivers[0];
  const nextMedicine = patient?.medication_schedule?.[0] || "medicine after food";
  const recent = [...state.memoryEvents].sort(byNewest).slice(0, 2).map((event) => event.summary).join(" ");
  return `Today, keep it simple: breakfast, ${nextMedicine}, and stay near familiar places. ${caregiver?.name || "Ananya"} is your care contact. ${recent}`;
}

function recentMemoryReply(state: CareState) {
  const recent = [...state.memoryEvents].sort(byNewest).filter((event) => event.summary).slice(0, 3);
  if (!recent.length) return "I do not have a recent note yet. That is okay. We can ask Ananya together.";
  return `The latest note says: ${recent[0].summary} I can remind you one step at a time.`;
}

function activeRisk(state: CareState): AlertSeverity {
  const alert = state.alerts.find((item) => item.status === "pending");
  return alert?.severity || "low";
}

async function groundedPublicAnswer(transcript: string): Promise<CareMemoryAnswer & { _mock?: boolean }> {
  const fallback = answer(
    "I can help with CareGrid memories best. Web search is not enabled right now, so please ask Ananya for latest public news.",
    "public_search"
  );
  const result = await generateGroundedJson<CareMemoryAnswer>(
    `Answer this public question for a dementia-friendly watch companion. Do not use or request private patient data. Keep reply to 2 short sentences. Return JSON with reply, intent, risk_level, action, should_end_session.\nQuestion: ${JSON.stringify(transcript)}`,
    fallback
  );
  return {
    ...fallback,
    ...result,
    intent: "public_search",
    action: "answer_only",
    should_end_session: false
  };
}

async function generateCareFallback(transcript: string, state: CareState, cue: WatchCue) {
  const compactState = {
    patient: state.patients[0],
    caregivers: state.caregivers,
    people: state.people.map((person) => ({
      name: person.name,
      relation: person.relation,
      role: person.role,
      trust: person.trust_level,
      memory_note: person.memory_note,
      last_seen_location: person.last_seen_location,
      last_conversation_summary: person.last_conversation_summary
    })),
    recent_events: [...state.memoryEvents].sort(byNewest).slice(0, 6),
    latest_location: state.latestLocation,
    latest_health: state.latestHealthSnapshot,
    active_capture_session: latestActiveCaptureSession(state),
    recent_capture_media: (state.captureMedia || []).slice(0, 4).map((media) => ({
      kind: media.kind,
      captured_at: media.captured_at,
      summary: media.summary,
      transcript_text: media.transcript_text?.slice(0, 180),
      privacy_level: media.privacy_level
    })),
    carelearn_topics: state.ndliResources.slice(0, 5),
    latest_cue: cue
  };
  const result = await generateJson<CareMemoryAnswer>(
    `You are Lumo, a calm non-human dementia-friendly care companion on a Galaxy Watch.
Answer from the CareGrid facts below. Be accurate, short, and respectful.
If facts are missing, say so gently. Do not diagnose. Do not claim surveillance.
For confusion or forgetting, reassure first, mention the known care note only as "your care notes say you have mild dementia", then give one calm next step.
Never argue, shame, or overload the patient. Keep replies to one or two simple sentences.
Return JSON with reply, intent, risk_level, action, should_end_session.

Allowed intent values: person_lookup, recent_memory, routine, health_summary, carelearn_learning, doctor_brief, location_safety, ambient_capture_consent, front_camera_identification, capture_stop, safety, general.
Allowed action values: answer_only, notify_caregiver, ok_checkin, end_session, request_camera_frame, start_capture_session, stop_capture_session.

CareGrid facts:
${JSON.stringify(compactState, null, 2)}

Question:
${JSON.stringify(transcript)}`,
    fallbackAnswer
  );
  return {
    ...fallbackAnswer,
    ...result,
    reply: short(result.reply || fallbackAnswer.reply)
  };
}

function byNewest(a: { timestamp?: string; created_at?: string }, b: { timestamp?: string; created_at?: string }) {
  return new Date(b.timestamp || b.created_at || 0).getTime() - new Date(a.timestamp || a.created_at || 0).getTime();
}

function short(reply: string) {
  const trimmed = reply.replace(/\s+/g, " ").trim();
  const sentences = trimmed.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= 2) return trimmed;
  return sentences.slice(0, 2).map((sentence) => sentence.trim()).join(" ").trim();
}

function asSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
