# RememberMe CareGrid



AI-assisted dementia care for Indian families — consent-aware memory, wandering safety, community coordination, and live hardware (Galaxy Watch + Android phone).

> **RememberMe does not just track patients.**  
> It gives them back context: who they met, where they are, what was said, and who can help.

---

## Table of contents

1. [Pitch](#pitch)
2. [Problem](#problem)
3. [Solution — three rings of care](#solution--three-rings-of-care)
4. [What we built](#what-we-built)
5. [System architecture](#system-architecture)
6. [Key product flows](#key-product-flows)
7. [Google AI stack](#google-ai-stack)
8. [Privacy & safety](#privacy--safety)
9. [Tech stack](#tech-stack)
10. [Repository layout](#repository-layout)
11. [Quick start](#quick-start)
12. [Environment variables](#environment-variables)
13. [Demo mode vs live services](#demo-mode-vs-live-services)
14. [Wear OS setup](#wear-os-setup)
15. [Phone WebView setup](#phone-webview-setup)
16. [Main routes](#main-routes)
17. [API surface (watch & care)](#api-surface-watch--care)
18. [Live product demo walkthrough](#live-product-demo-walkthrough)
19. [Local Gemma (optional)](#local-gemma-optional)
20. [Builder & Track](#builder--track)

---

## Pitch

**RememberMe CareGrid** is an end-to-end care system for people living with dementia and the people around them.

| Layer | Role |
|-------|------|
| **Web app** | Patient hub, caregiver dashboard, SafePath, CareCircle, CareLearn, Doctor Brief, enrollment, Memory Guard |
| **Galaxy Watch** | Native Wear OS client: GPS, check-in, Twilio SOS, cues, AAC cards, rescue QR |
| **Android phone** | WebView into CareGrid for Memory Guard and community actions on the go |
| **Gemini** | Structured care intelligence: cues, summaries, training cards, doctor briefs, privacy/wandering helpers |

Built for a **live Razorpay Buildathon demo**: real tunnel (HTTPS), real watch HTTP calls, optional real SMS/call via Twilio, optional Firebase sync, deterministic fallbacks when keys are missing so the demo never hard-crashes.

---

## Problem

In many Indian households, dementia care rests on **one exhausted primary caregiver**.

Patients may:

- Forget **who** a familiar face is  
- Lose track of **where** they are relative to home  
- Struggle to **ask for help** when words fail  
- Leave a **safe zone** without anyone noticing in time  

Existing tools often stop at:

- GPS tracking only  
- Family chat noise with no structure  
- Clinical language that scares rather than calms  
- Continuous surveillance that families reject  

Caregivers also lack:

- A **clean weekly story** for the doctor  
- A way to **train neighbours / ASHA / RWA** without dumping private data  
- Hardware that can **call for help**, not only open an app  

---

## Solution — three rings of care

```text
                    ┌─────────────────────┐
                    │   COMMUNITY RING    │
                    │ CareCircle · CareLearn │
                    │ Rescue QR · RWA/ASHA │
                    └──────────▲──────────┘
                               │
                    ┌──────────┴──────────┐
                    │    FAMILY RING      │
                    │ Caregiver · Alerts  │
                    │ Timeline · Doctor   │
                    │ Brief · Twilio SOS  │
                    └──────────▲──────────┘
                               │
                    ┌──────────┴──────────┐
                    │   PATIENT RING      │
                    │ Lumo cues · Journal │
                    │ Memory Guard · Map  │
                    │ Watch · AAC cards   │
                    └─────────────────────┘
```

### Ring 1 — Patient

- Calm **Lumo** orientation cues (day, visitors, take it slow)  
- **Voluntary memory journal** (not always-on recording)  
- **Memory Guard** — consent-first capture; media only after the patient agrees  
- **Trusted-face recognition** via enrolled embeddings (`@vladmandic/human`)  
- **SafePath** awareness and calming language on risk  
- **Watch**: I’m okay, SOS, short AAC phrases when speech fails  

### Ring 2 — Family

- **Caregiver dashboard** — alerts, health sync, timeline  
- **SafePath** map — home geofence, safe/risky places, live watch GPS  
- **Twilio** SMS + optional voice call on caregiver notify / SOS  
- **Doctor Brief** — Gemini weekly summary from real care events  

### Ring 3 — Community

- **CareCircle** — neighbour / ASHA / pharmacy / RWA style task flow (accept → reached → safe)  
- **CareLearn** — Gemini-generated role training, quizzes, RWA awareness sessions  
- **Rescue page + QR** — bystander can notify caregiver with location **without** a full medical dump  

---

## What we built

### Web (Next.js)

| Module | Description |
|--------|-------------|
| **Patient hub** | Large, calm UI for cues, journal, safety status |
| **Enroll** | Upload 5–10 consented photos → averaged face embedding for a trusted person |
| **Memory Guard** | Session-based capture flow with movement / speech candidates and consent gates |
| **Caregiver** | Live care state, alerts, watch health snapshots |
| **SafePath** | Leaflet map, geofence evaluation, simulate exit, location pings |
| **CareCircle** | Community task lifecycle after risk / SOS |
| **CareLearn** | Role-specific lessons and Gemini-generated cards / awareness events |
| **Doctor Brief** | Generate + print/PDF-oriented clinician summary |
| **Rescue** | Public-ish bystander page keyed by patient id |
| **Watch web mirror** | Same actions as hardware if the watch is unavailable (`/watch`, not primary nav) |

### Galaxy Watch (native Kotlin)

- `POST` location, check-in, alert, health  
- `GET` latest patient cue (vibrate + TTS-friendly payload)  
- Optional talk / talk-audio endpoints  
- Built-in **rescue URL** from `caregridApiBase`  
- Configured at build time via `wearos/gradle.properties`  

### Android phone (WebView)

- Loads the CareGrid web origin over **HTTPS tunnel**  
- Optimized for demo performance when the server runs **production** Next (`build` + `start`)  
- Primary phone story: **Memory Guard** + community tabs  

---

## System architecture

```text
┌──────────────┐     HTTPS      ┌────────────────────────────────┐
│ Galaxy Watch │ ─────────────► │  Next.js (App Router)          │
│  (Kotlin)    │  /api/watch/*  │  Gemini · Twilio · Firebase    │
└──────────────┘                │  Face match · Geofence · State │
                                └───────────────▲────────────────┘
┌──────────────┐     HTTPS                      │
│ Phone WebView│ ───────────────────────────────┤
│  CareGrid UI │  /memory-capture, maps, tasks  │
└──────────────┘                                │
┌──────────────┐     HTTPS                      │
│ Laptop /     │ ───────────────────────────────┘
│ Web Browser  │  Full dashboard + demo
└──────────────┘
```

**Data plane (simplified):**

1. Watch / phone / browser write **events** (location, SOS, journal, recognition, tasks).  
2. Server evaluates **geofence / risk**, may call **Twilio**, may call **Gemini**.  
3. Shared care state updates **timeline**, **alerts**, **CareCircle**, **cues**.  
4. Optional **Firestore** sync; without Firebase, **local demo store** still runs the story.  

---

## Key product flows

### 1) Trusted person → calm cue

1. Caregiver enrolls a person with **consented photos** on `/enroll`.  
2. Embeddings are averaged and stored on the person profile.  
3. Memory Guard (or lens pipeline) matches a frame **only** against enrolled people.  
4. On match, a short **dementia-friendly cue** can be generated and pushed toward the **watch cue** API.  
5. Unknown face → **no invented identity** (privacy-correct miss).  

### 2) Watch GPS → SafePath → family alert

1. Watch sends coordinates to `/api/watch/location` (manual Send GPS and/or periodic while active).  
2. Backend measures distance to home + nearby risky places.  
3. Outside safe radius / high risk → alert + memory event + optional CareCircle task.  
4. Caregiver sees status on **SafePath** and **Caregiver** views.  

### 3) Notify caregiver / SOS → Twilio

1. Watch **Notify caregiver** or **SOS** → `/api/watch/alert`.  
2. Event is always stored in CareGrid (demo-safe).  
3. If Twilio env is set, server sends **SMS** and optional **call** to `TWILIO_EMERGENCY_TO`.  
4. Watch UI can surface delivery status from the API response.  

### 4) Bystander rescue

1. Watch / card shows a **QR** to `/rescue/{patientId}`.  
2. Bystander opens page, sees limited context, can **notify caregiver with location**.  
3. No full medical chart exposed to strangers.  

### 5) CareLearn → trained community

1. Open `/carelearn`, pick a role (neighbour, ASHA, pharmacy, RWA, …).  
2. Gemini generates a practical training card / quiz / awareness agenda.  
3. Completion feeds rewards / history for the care network story.  

### 6) Doctor Brief

1. Week’s events sit on the care timeline.  
2. `/doctor-report` asks Gemini for a **clinician-ready** structured brief.  
3. Family walks into the appointment with signal, not a blank form.  

---

## Google AI stack

| Capability | How we use it |
|------------|----------------|
| **Gemini API** (`@google/genai`) | Patient cues, conversation / journal summaries, CareLearn cards, awareness events, privacy decisions, wandering assessment text, doctor report |
| **Structured JSON generation** | Stable UI contracts with deterministic **mock fallbacks** if the key or model fails |
| **Gemini Live (optional path)** | Real-time multimodal companion route exists under `/live` (not required for the core demo path) |
| **ADK-style workflow** | Agent-shaped care pipeline (`@google/adk`) for multi-step care reasoning demos |
| **Optional local Gemma** | Same text JSON features via Ollama when local env is enabled (see below) |

Face identity matching for trusted people is **embedding-based** (`@vladmandic/human`), not “Gemini invents a name.” Gemini may assist **cue wording** or optional vision fallback; core enrollment match is consented descriptors.

---

## Privacy & safety

We designed CareGrid as **consent-aware care memory**, not a spy stack.

| Principle | Behavior |
|-----------|----------|
| No continuous silent recording as the product story | Memory Guard asks before saving meaningful media |
| Only enrolled faces | Unknown people are not labeled with fake names |
| Least privilege for bystanders | Rescue page is help + notify, not full records |
| Non-clinical language | Cues and briefs avoid diagnosis / progression claims |
| Demo-safe failures | Missing Twilio / Gemini still leaves a coherent timeline |

**We do not claim:** medical diagnosis, disease prediction, or continuous city-scale surveillance.

---

## Tech stack

| Area | Choice |
|------|--------|
| App framework | **Next.js 16.2** (App Router), **React 19**, **TypeScript** |
| Styling | **Tailwind CSS 4**, warm editorial care UI |
| AI | **@google/genai 2.x**, **@google/adk 1.x** |
| Face | **@vladmandic/human 3.x** |
| Maps | **Leaflet** + **react-leaflet** + OSM |
| State | Client care store (+ optional **Firebase 12** Firestore) |
| Charts / UX | recharts, motion, sonner, jspdf, qrcode.react |
| SOS | **Twilio** SMS + calls |
| Watch | **Kotlin** Wear OS app |
| Phone | Android **WebView** shell |
| Tests | **Vitest** |

---

## Repository layout

```text
RememberMe-main/
├── README.md                 ← this file
├── package.json
├── .env.example
├── public/                   ← samples, static care data
├── src/
│   ├── app/                  ← routes + API handlers
│   │   ├── api/              ← Gemini, watch, capture, SOS, …
│   │   ├── patient/
│   │   ├── enroll/
│   │   ├── memory-capture/   ← Memory Guard
│   │   ├── caregiver/
│   │   ├── safe-path/
│   │   ├── care-circle/
│   │   ├── carelearn/
│   │   ├── doctor-report/
│   │   ├── rescue/[patientId]/
│   │   └── …
│   ├── components/           ← UI shells, map, timeline, …
│   └── lib/                  ← AI, Firebase, geofence, face, Twilio, store
└── wearos/
    ├── app/                  ← Watch Kotlin sources
    ├── mobile/               ← Phone WebView shell
    ├── gradle.properties     ← caregridApiBase / caregridWebUrl
    └── README.md
```

---

## Quick start

### Prerequisites

- **Node.js 20+** recommended  
- npm  
- (Optional) Android Studio for watch / phone APKs  
- (Optional) ngrok or similar **HTTPS** tunnel for hardware  

### Install & run (development)

```bash
npm install
cp .env.example .env.local
# edit .env.local — at least GEMINI_API_KEY for live AI

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run for hardware demos (recommended)

`next dev` over a tunnel is slower on phone WebView. Prefer production:

```bash
npm run build
npm run demo
# or: npm run start:demo

# separate terminal
ngrok http 3000
```

Point **watch** `caregridApiBase` and **phone** `caregridWebUrl` at the HTTPS origin.

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run demo` / `start` | Serve production build |
| `npm run start:demo` | Build then start |
| `npm test` | Vitest |

---

## Environment variables

Copy from `.env.example` into `.env.local` (never commit secrets).

### Gemini

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Server-side Gemini (required for live generation) |
| `GEMINI_MODEL` | Comma-separated model fallbacks |
| `GEMINI_TIMEOUT_MS` | Request timeout |
| `GEMINI_LIVE_MODEL` | Optional Live companion model |
| `ENABLE_AFFECTIVE_DIALOG` | Live affective flag (model-dependent) |

### Firebase (optional)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | Web config; if incomplete → **local Demo Mode** |

### Twilio SOS (optional)

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | Account |
| `TWILIO_AUTH_TOKEN` | Auth |
| `TWILIO_FROM_NUMBER` | Sender number |
| `TWILIO_EMERGENCY_TO` | Caregiver destination (E.164) |
| `TWILIO_ENABLE_CALLS` | `true` to place voice calls |

### Local Gemma / Ollama (optional)

| Variable | Purpose |
|----------|---------|
| `OLLAMA_URL` | e.g. `http://localhost:11434` |
| `OLLAMA_MODEL` | e.g. `gemma4:e2b` |
| `OLLAMA_TIMEOUT_MS` | Default `120000` |
| `OLLAMA_KEEP_ALIVE` | e.g. `30m` |
| `USE_LOCAL_GEMMA` | `true` / `false` force switch; default = use Ollama only if URL/MODEL set |

---

## Demo mode vs live services

| Missing | What still works |
|---------|------------------|
| No `GEMINI_API_KEY` | Structured **mock JSON** keeps UI and demo story intact |
| No Firebase | **Local care store** — full single-device demo |
| No Twilio | SOS / notify **recorded** in CareGrid; no real SMS/call |
| No Ollama | **Gemini** (or mocks) for text features |

This is intentional for runtime reliability and offline resilience.

---

## Wear OS setup

1. Open `wearos/` in **Android Studio**.  
2. Edit `wearos/gradle.properties`:

```properties
caregridApiBase=https://YOUR-HTTPS-TUNNEL
caregridWebUrl=https://YOUR-HTTPS-TUNNEL/community-app
```

3. Enable developer options + debugging on the watch.  
4. Install the debug watch app.  
5. Confirm the watch can reach the tunnel (same Wi‑Fi / hotspot as the laptop is fine for demos).  

### Watch actions → APIs

| Watch action | Endpoint |
|--------------|----------|
| Send GPS | `POST /api/watch/location` |
| I’m okay | `POST /api/watch/checkin` |
| Notify / SOS | `POST /api/watch/alert` |
| Sync health | `POST /api/watch/health` |
| Pull cue | `GET /api/watch/cue` |
| Talk | `POST /api/watch/talk` (and talk-audio) |

Fallback if hardware fails mid-demo: open `/watch` on the laptop (same backend contracts).

---

## Phone WebView setup

1. Build/install the **mobile** module under `wearos/mobile` (or your existing CareGrid phone APK).  
2. `caregridWebUrl` must be **HTTPS** (camera + secure WebView).  
3. Prefer `npm run build && npm run demo` on the laptop.  
4. Primary demo surface: **Memory Guard** at `/memory-capture`.  

Notes:

- Phone is a **WebView shell**, not a full native Compose redesign of every screen.  
- Heavy face work can run on the **laptop API** (`/api/recognize-face`) so the phone mainly captures and uploads.  

---

## Main routes

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | Everyone | Product home & pitch |
| `/patient` | Patient / demo | Lumo cue, journal, status |
| `/enroll` | Caregiver | Trusted face enrollment |
| `/memory-capture` | Patient / demo | Memory Guard |
| `/caregiver` | Family | Dashboard, alerts, health |
| `/safe-path` | Family | Map + geofence |
| `/care-circle` | Community | Task coordination |
| `/carelearn` | Community | Gemini training |
| `/doctor-report` | Family / clinician story | Weekly brief |
| `/rescue/[patientId]` | Bystander | QR rescue notify |
| `/community-app` | Phone shell entry | Mobile-oriented hub |
| `/watch` | Fallback | Web watch mirror |
| `/live` | Optional | Lumo Live companion |
| `/lens` | Optional | SmritiLens matching UI |

Seeded demo patient id commonly used in rescue: `patient_rajamma` → `/rescue/patient_rajamma`.

---

## API surface (watch & care)

Representative server routes under `src/app/api/`:

| Area | Examples |
|------|----------|
| Watch | `watch/location`, `watch/checkin`, `watch/alert`, `watch/health`, `watch/cue`, `watch/talk` |
| Capture / Guard | `capture/session`, `capture/consent`, `capture/photo`, `capture/movement`, `capture/speech-candidate`, `capture/complete` |
| Identity | `enroll-person`, `recognize-face` |
| Care AI | `generate-patient-cue`, `summarize-conversation`, `memory-journal`, `privacy-decision`, `simulate-geofence` |
| Community / clinical | CareLearn generators, `generate-doctor-report`, `community-task`, `create-alert`, `sos` |
| Live (optional) | `live/token`, `live/tools` |

All AI JSON helpers are built to degrade to **demo-shaped** payloads when providers are unavailable.

---

## Live product demo walkthrough

Suggested **live** path (≈3 minutes):

1. **Home** — problem + three rings + builder info  
2. **Patient** — calm cue + voluntary memory story  
3. **Watch** — Send GPS → I’m okay → Notify caregiver / SOS (real Twilio if configured)  
4. **SafePath + Caregiver** — location / alert landed for the family  
5. **Memory Guard (phone)** — consent-first capture; trusted face or clear unknown privacy behavior  
6. **Rescue QR** — bystander page without oversharing  
7. **CareLearn** — community role training via Gemini  
8. **Doctor Brief** — clinician-ready weekly summary  

**Hardware recording tip:** laptop screen for web; phone screen record during Guard; wrist camera for watch.

---

## Local Gemma (optional)

For offline / local-inference demos, text JSON features can route through **Ollama** (e.g. `gemma4:e2b`) when:

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b
```

are set (unless `USE_LOCAL_GEMMA=false`).

- Implementation: `src/lib/ai/ollama.ts`, `gemma.ts`, router `provider.ts`  
- **Default without those vars:** pure **Gemini** path (unchanged for cloud demos)  
- Multimodal Live / some vision / talk-audio paths stay on Gemini  

Install model example:

```bash
ollama pull gemma4:e2b
```

---

## Builder & Track

| | |
|--|--|
| **Event** | Razorpay Buildathon |
| **Track** | Track 05 : Open Track |
| **Builder** | Manjunath Patil |
| **Product** | RememberMe CareGrid |

---

## License / use

Built as a **Razorpay Buildathon demonstration**. Configure your own API keys and Twilio numbers. Do not commit `.env.local` or private patient data. Treat enrolled face embeddings and care timelines as sensitive.
