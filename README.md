# RememberMe CareGrid

AI-assisted dementia care for Indian families — consent-aware memory, wandering safety, community coordination, and live hardware (Samsung Galaxy Watch 4 + Android phone).

> **RememberMe does not just track patients.**  
> It gives them back context: who they met, where they are, what was said, and who can help.

---

## Builder & Track Info

| Property | Details |
|---|---|
| **Hackathon** | **Razorpay Buildathon 2026** |
| **Track** | **Track 05 : Open Track** |
| **Solo Builder** | **Manjunath Patil** (`manjunathpatil3155@gmail.com`) |
| **Project** | **RememberMe CareGrid** |

---

## Table of contents

1. [What Broke, and How I Got Out](#1-what-broke-and-how-i-got-out)
2. [The Problem & Three Rings of Care](#2-the-problem--three-rings-of-care)
3. [System Architecture & Hardware Integration](#3-system-architecture--hardware-integration)
4. [Evaluation Modes & Setup Guide](#4-evaluation-modes--setup-guide)
5. [Core Product Modules & Evaluator Tour](#5-core-product-modules--evaluator-tour)
6. [AI Architecture & Multimodal Intelligence](#6-ai-architecture--multimodal-intelligence)
7. [Privacy, Ethics & Consent-First Design](#7-privacy-ethics--consent-first-design)
8. [Tech Stack & Repository Structure](#8-tech-stack--repository-structure)
9. [License & Ethical Use](#9-license--ethical-use)

---

## 1. What Broke, and How I Got Out

*(An honest engineering retrospective on the most challenging hurdles faced during the build and how they were resolved).*

### 1. Hardware-in-the-Loop Network Fragility & Watch Latency
* **What Broke:** Testing a native Kotlin Wear OS app (Samsung Galaxy Watch 4) streaming real-time GPS pings, accelerometer movement, and voice recordings over local Wi-Fi tunnels was brittle. Flaky mobile hotspots caused the watch client to hang or drop packets when attempting live server synchronizations, completely halting frontend verification.
* **How I Got Out:** 
  1. Built an offline-first contract with decoupled background worker synchronization and deterministic JSON fallbacks.
  2. Implemented a full **browser-based Wear OS mirror at `/watch`**. The web companion exercises the exact same REST API endpoints (`/api/watch/location`, `/api/watch/checkin`, `/api/watch/alert`, `/api/watch/talk`) using identical schemas, allowing seamless development and evaluation even when physical watch hardware or tunnels are unavailable.

### 2. Client-Side Face Embedding Bottlenecks on Low-Power Devices
* **What Broke:** Initial attempts to run `@vladmandic/human` face detection and 128-dimensional embedding extraction entirely inside an Android WebView shell on older phones caused thermal throttling, severe camera frame drops (dropping below 3 FPS), and intermittent memory crashes.
* **How I Got Out:** 
  1. Architected a hybrid offloading model: the phone WebView strictly handles lightweight canvas frame capture and user consent verification.
  2. The raw frame is shipped to `/api/recognize-face`, where feature extraction and vector cosine similarity comparison against enrolled trusted contacts occur server-side. This keeps the phone camera running smoothly at high frame rates while safeguarding patient battery life.

### 3. Graceful Degradation: Zero-Key Demo Resilience
* **What Broke:** Hard dependencies on external cloud APIs (Gemini multimodal vision, Twilio SMS & voice calls, Firebase Firestore) meant that an invalid API key, credit exhaustion, or missing environment variable would throw uncaught exceptions and break the entire care timeline during evaluation.
* **How I Got Out:** 
  1. Engineered a multi-tier fallback architecture: every single AI and hardware endpoint has an inline mock generator with realistic clinical and care responses (`src/lib/ai/mocks.ts`).
  2. If Twilio credentials are not supplied, the geofencing engine logs a simulated emergency dispatch (`[CareGrid SOS] Twilio env vars missing, SOS simulated`) and gracefully renders the caregiver notification in the UI without crashing.
  3. The result is a **100% zero-configuration evaluation experience** for judges.

---

## 2. The Problem & Three Rings of Care

### The Problem
In many Indian households, dementia care rests on **one exhausted primary caregiver**. Patients frequently:
- Forget **who** a familiar face is, triggering panic and disorientation.
- Lose track of **where** they are relative to home.
- Struggle to **ask for help** when words fail.
- Leave a **safe zone** without family noticing in time.

Existing solutions rely on invasive 24/7 video surveillance that families reject, or generic GPS trackers that dump raw coordinates without context or calming guidance.

### The Solution: Three Rings of Care
CareGrid structures care into three concentric, interconnected layers:

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

1. **Patient Ring (Dignity & Orientation):**
   - Calm **Lumo** speech cues orient the patient to the day and upcoming visitors.
   - **SafePath** GPS companion on Galaxy Watch 4 provides orientation and reassuring voice guidance.
   - **Memory Guard** enables consent-first memory capture only when the patient agrees.
2. **Family Ring (Safety & Clinical Clarity):**
   - Real-time **Caregiver Dashboard** tracking vitals, step counts, and location alerts.
   - **SafePath Geofencing**: Automatic detection when patient leaves home safe zone.
   - **Twilio Emergency Telephony**: Outbound voice calls and SMS alerts directly to the caregiver's phone.
   - **Doctor Brief**: Generative weekly clinical narrative synthesizing incidents for clinician visits.
3. **Community Ring (Decentralized Support):**
   - **CareCircle**: Coordinate quick check-in tasks with neighbours, apartment RWA, or local ASHA workers.
   - **CareLearn**: AI-generated micro-learning modules for community awareness.
   - **Bystander Rescue QR**: Allows a helpful passerby to notify the caregiver with current location **without exposing sensitive medical records**.

---

## 3. System Architecture & Hardware Integration

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             HARDWARE PERIPHERALS                                 │
│  ┌─────────────────────────┐                        ┌─────────────────────────┐  │
│  │ Samsung Galaxy Watch 4  │                        │     Android Phone       │  │
│  │ (Native Kotlin Wear OS) │                        │   (WebView + Camera)    │  │
│  │ GPS · Vibrate · Mic · QR│                        │ Consent Gate · Canvas   │  │
│  └────────────┬────────────┘                        └────────────┬────────────┘  │
└───────────────┼──────────────────────────────────────────────────┼───────────────┘
                │ HTTPS (REST / SSE)                               │ Base64 Frames
                ▼                                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       NEXT.JS 16 APP ROUTER (CAREGRID CORE)                      │
│                                                                                  │
│   /api/watch/*               /api/recognize-face         /api/sos                │
│   • location (geofence)      • 128D Cosine Vector Match  • Twilio Voice & SMS    │
│   • checkin ("I'm okay")     • @vladmandic/human         • Coordinates Dispatch  │
│   • talk (audio / transcript)• Consent verification                              │
│                                                                                  │
│   /api/generate-doctor-report        /api/generate-patient-cue                   │
│   • Weekly clinical synthesis        • Daily orientation speech                  │
└───────────────────────┬──────────────────────────────────┬───────────────────────┘
                        │                                  │
                        ▼                                  ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────────────┐
│        GEMINI 2.5 MULTIMODAL AI       │  │          EXTERNAL SERVICES            │
│  • Speech orientation & calming cues  │  │  • Twilio (Voice Calls + SMS)         │
│  • Contextual memory dialogue         │  │  • Firebase Firestore (Realtime Sync) │
│  • Doctor clinical report synthesis   │  │  • OpenStreetMap / Leaflet (GIS)      │
└───────────────────────────────────────┘  └───────────────────────────────────────┘
```

### Hardware Contracts (Wear OS & Android)
- **Watch Pings (`POST /api/watch/location`)**: Transmits latitude, longitude, and accuracy. The backend evaluates distance against the home geofence (500m radius) using the Haversine formula.
- **Wandering Escalation (`POST /api/sos`)**: If coordinates fall outside the safe zone, the server dispatches a Twilio voice call and SMS alert while sending calming text-to-speech directions back to the watch bezel.
- **Check-In (`POST /api/watch/checkin`)**: 1-tap "I'm okay" button clears alert timers and logs patient responsiveness.
- **Voice Assistant (`POST /api/watch/talk` & `talk-audio`)**: Audio recorded from the watch mic is transcribed and resolved by Gemini into reassuring location/memory answers.

---

## 4. Evaluation Modes & Setup Guide

To ensure a seamless evaluation experience, CareGrid provides two distinct setups:

| Mode | Target | Requirements | What is Exercised |
| :--- | :--- | :--- | :--- |
| **Mode A: Zero-Setup Instant Demo** | Fast Code & UX Review | Node 18+ only (No keys, no watch needed) | Pre-seeded clinical data, deterministic fallback mocks, browser `/watch` companion simulator, simulated SOS dispatch. |
| **Mode B: Full-Fledged Live Hardware** | Complete Production Audit | Gemini API Key + Twilio + Galaxy Watch 4 + Firebase | Live Gemini multimodal generation, real emergency phone calls & SMS to caregiver phone, real Galaxy Watch 4 Kotlin app via wireless ADB, realtime Firestore multi-device sync. |

---

### Mode A: Zero-Setup Instant Demo (Fastest)

> [!TIP]
> **No API keys or external services are needed!**  
> Pre-seeded clinical and sensor data, local state storage, and fallback AI providers allow you to evaluate every core workflow immediately without hitting external rate limits or paywalls.

```bash
# 1. Clone the repository
git clone https://github.com/ladiesmans217/Razorpay-Buildathon.git
cd Razorpay-Buildathon

# 2. Install dependencies (Node 18+ or 20+ recommended)
npm install

# 3. Start the Next.js development server
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Mode B: Full-Fledged Live Hardware & Production Experience

For the complete, authentic production experience as built and demonstrated in our pitch:

#### 1. Live Gemini AI
Add your API key to `.env.local`:
```bash
cp .env.example .env.local
# Set GEMINI_API_KEY=your_key_here
```
This activates live multimodal Gemini generation for dementia patient cues, memory conversation analysis, and dynamic clinician brief synthesis.

#### 2. Native Samsung Galaxy Watch 4 (Wear OS)
1. Open the `/wearos` folder in **Android Studio**.
2. Expose your local Next.js server to an HTTPS origin (e.g. `ngrok http 3000`).
3. Set the endpoint in `wearos/gradle.properties`:
   ```properties
   caregridApiBase=https://YOUR-TUNNEL-URL.ngrok-free.app
   caregridWebUrl=https://YOUR-TUNNEL-URL.ngrok-free.app/community-app
   ```
4. Enable **Developer Options** and **Wireless Debugging** on the Samsung Galaxy Watch 4.
5. Deploy the debug APK to the watch via ADB. The watch will stream real hardware GPS pings, trigger native wrist vibration patterns, and capture microphone audio directly to the CareGrid backend.

#### 3. Real Emergency SOS Telephony (Twilio)
In `.env.local`, configure:
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_EMERGENCY_TO=+91XXXXXXXXXX
TWILIO_ENABLE_CALLS=true
```
When a geofence breach occurs or the patient taps **"Notify Caregiver"** on the watch, CareGrid automatically places an **outbound phone call** with text-to-speech audio and dispatches an **SMS alert with live Google Maps coordinates** to the caregiver's real phone.

#### 4. Realtime Cloud Sync (Firebase)
Fill in `NEXT_PUBLIC_FIREBASE_*` variables in `.env.local` to enable multi-device live sync across watch, patient phone, and caregiver workstation via Firestore.

---

## 5. Core Product Modules & Evaluator Tour

Follow this curated 3-minute evaluation tour to inspect all core features:

| Order | Page | What to Test / Verify |
| :---: | :--- | :--- |
| **1** | [`/`](http://localhost:3000/) | **Home & Architecture**: Core mission, three rings of care, and architectural breakdown. |
| **2** | [`/watch`](http://localhost:3000/watch) | **Galaxy Watch 4 Companion**: Interactive watch shell. Click **"Speak cue"**, tap **"I'm okay"** or **"Notify caregiver"**, and view the dynamic QR rescue link. |
| **3** | [`/safe-path`](http://localhost:3000/safe-path) | **SafePath Geofencing**: Live Leaflet map displaying safe zones (home, temple) vs. risky zones (busy main road), with active patient coordinates. |
| **4** | [`/caregiver`](http://localhost:3000/caregiver) | **Caregiver Dashboard**: Real-time event stream, vitals (heart rate, step counts, sleep quality), and active alerts. |
| **5** | [`/doctor-report`](http://localhost:3000/doctor-report) | **Doctor Brief**: Clinical summary showing weekly behavioral patterns, wandering incidents, and clinician talking points. |
| **6** | [`/rescue/patient_rajamma`](http://localhost:3000/rescue/patient_rajamma) | **Bystander Rescue Page**: The mobile-responsive recovery screen a passerby sees when scanning the patient's watch QR code. |

---

## 6. AI Architecture & Multimodal Intelligence

CareGrid integrates AI pragmatically across three specialized surfaces:

### 1. Gemini Speech & Orientation Intelligence
- **Daily Context Cues (`/api/generate-patient-cue`)**: Generates simple, anxiety-reducing orientation statements tailored to the patient's cognitive baseline.
- **Voice Query Resolution (`/api/watch/talk`)**: When a patient asks *"Where am I?"* or *"Who came yesterday?"*, Gemini resolves the question against recent memory events and SafePath coordinates, replying with gentle reassurance.

### 2. Clinical Narrative Synthesis
- **Doctor Brief Generator (`/api/generate-doctor-report`)**: Reads raw chronological telemetry (wandering events, sleep scores, check-in responsiveness) and synthesizes a structured, clinical weekly brief formatted for consultation.

### 3. Face Identity Embeddings (Consent-First)
- Face recognition uses **mathematical 128-dimensional vector cosine similarity** via `@vladmandic/human`.
- Gemini is **not** allowed to hallucinate or guess unfamiliar faces; unknown people are safely categorized as *"Unknown Person"*, protecting family privacy.

---

## 7. Privacy, Ethics & Consent-First Design

CareGrid is explicitly designed as a **consent-aware care memory platform**, not an intrusive surveillance camera.

| Principle | Technical Implementation |
| :--- | :--- |
| **No Silent Continuous Recording** | The Memory Guard flow requires explicit patient consent before capturing any photo or audio. |
| **No Hallucinated Identities** | Only pre-enrolled trusted faces with computed embedding centroids are identified. |
| **Bystander Least-Privilege** | Scanning the watch QR code opens a lightweight recovery screen allowing the bystander to notify the family without displaying sensitive clinical records or financial data. |
| **Calming Non-Clinical Vocabulary** | UI alerts and speech cues use comforting, dignity-preserving language rather than clinical jargon that triggers anxiety. |

---

## 8. Tech Stack & Repository Structure

### Technology Stack
- **Framework**: Next.js 16.2 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4, Lucide Icons, Framer Motion
- **AI & Vision**: `@google/genai 2.x`, `@vladmandic/human 3.x`
- **Wearable Hardware**: Samsung Galaxy Watch 4 (Kotlin, Wear OS 3.0+)
- **Mobile Companion**: Android WebView shell (`wearos/mobile`)
- **Mapping & Geofencing**: Leaflet, React-Leaflet, OpenStreetMap
- **Telephony & Notifications**: Twilio Voice & SMS APIs
- **Database / State**: React Care Store + optional Firebase 12 Firestore
- **Testing**: Vitest, React Testing Library

### Repository Layout
```text
Razorpay-Buildathon/
├── README.md                      ← Project documentation & judge evaluation guide
├── package.json                   ← Next.js dependencies & run scripts
├── .env.example                   ← Template for Gemini, Twilio, & Firebase keys
├── public/                        ← Sample audio, avatar assets, and static data
├── src/
│   ├── app/                       ← Next.js App Router pages & API handlers
│   │   ├── api/                   ← Watch sync, SOS, Gemini AI, & geofencing routes
│   │   ├── watch/                 ← Browser-based Galaxy Watch 4 companion simulator
│   │   ├── safe-path/             ← Interactive geofencing map & safe zone monitor
│   │   ├── caregiver/             ← Real-time family dashboard & vitals stream
│   │   ├── doctor-report/         ← AI-synthesized weekly clinical story
│   │   ├── rescue/[patientId]/    ← Bystander recovery card with QR support
│   │   ├── patient/               ← Patient orientation hub & memory journal
│   │   ├── enroll/                ← Face profile enrollment flow
│   │   └── memory-capture/        ← Memory Guard consent-aware capture interface
│   ├── components/                ← Modular UI components, map views, & app shells
│   └── lib/                       ← AI providers, geofence math, Twilio client, & store
└── wearos/
    ├── app/                       ← Native Samsung Galaxy Watch 4 Kotlin source code
    ├── mobile/                    ← Android phone WebView wrapper
    └── gradle.properties          ← Hardware tunnel & API configuration
```

---

## 9. License & Ethical Use

Built by **Manjunath Patil** for the **Razorpay Buildathon 2026** under **Track 05 : Open Track**. 

Please configure your own API credentials for live deployments. Treat enrolled biometric face embeddings and patient telemetry as strictly private and confidential.
