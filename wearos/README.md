# CareGrid Wear OS

Native Galaxy Watch companion for the **Razorpay Buildathon** (Built by Manjunath Patil).

## What it does

- Send GPS → `/api/watch/location`
- I’m okay → `/api/watch/checkin`
- Notify caregiver / SOS → `/api/watch/alert` (Twilio when configured)
- Health sync → `/api/watch/health`
- Pull cues → `/api/watch/cue`
- Optional talk → `/api/watch/talk` / `talk-audio`
- Bystander rescue URL built from `caregridApiBase`

## Setup

1. Open this `wearos` folder in Android Studio.
2. Set HTTPS base in `gradle.properties`:

```properties
caregridApiBase=https://YOUR-TUNNEL
caregridWebUrl=https://YOUR-TUNNEL/community-app
```

3. Install debug APK on the watch (wireless ADB or Android Studio).
4. Backend must be reachable over HTTPS (ngrok / similar → `npm run demo` on port 3000).

Phone WebView module lives under `mobile/` and loads `caregridWebUrl`.
