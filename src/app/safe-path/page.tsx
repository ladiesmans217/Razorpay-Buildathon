"use client";

import { useEffect, useState } from "react";
import { Loader2, LocateFixed, MapPin, Navigation, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhoneOrDesktopShell, useIsMobileWebView } from "@/components/mobile-app-shell";
import { LumoOrb } from "@/components/lumo-orb";
import { SafeMap } from "@/components/safe-map";
import { WatchMock } from "@/components/watch-mock";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useCareStore } from "@/lib/care-store";
import type { Alert, WanderingAssessment } from "@/lib/types";
import { distanceMeters, safePathPlaces } from "@/lib/safepath";

export default function SafePathPage() {
  const { state, simulateWandering, setLatestLocation, commit } = useCareStore();
  const [assessment, setAssessment] = useState<WanderingAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapEnabled, setMapEnabled] = useState(false);
  const isPhone = useIsMobileWebView();

  // Phone: defer Leaflet until idle / explicit open so first paint stays light.
  useEffect(() => {
    if (!isPhone) {
      setMapEnabled(true);
      return;
    }
    const enable = () => setMapEnabled(true);
    const ric = window.requestIdleCallback?.(enable, { timeout: 900 });
    const timer = typeof ric === "number" ? undefined : window.setTimeout(enable, 400);
    return () => {
      if (typeof ric === "number" && window.cancelIdleCallback) window.cancelIdleCallback(ric);
      if (timer) window.clearTimeout(timer);
    };
  }, [isPhone]);
  const patient = state.patients[0];
  const homePlace = state.places.find((place) => place.type === "home" && typeof place.latitude === "number" && typeof place.longitude === "number");
  const homePoint = homePlace ? { latitude: homePlace.latitude!, longitude: homePlace.longitude! } : safePathPlaces.home;
  const latestDistance = state.latestLocation
    ? distanceMeters(state.latestLocation, homePoint)
    : 0;

  const runSimulation = async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/simulate-geofence", { method: "POST", body: JSON.stringify({}) }).then((res) => res.json());
      setAssessment(data);
      simulateWandering();
    } finally {
      setLoading(false);
    }
  };

  const useBrowserGps = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatestLocation({
          patient_id: patient.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captured_at: new Date().toISOString(),
          source: "browser_gps"
        });
        void postLocationPing(position.coords.latitude, position.coords.longitude, "Browser GPS geofence check from SafePath.");
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
    );
  };

  const updateRadius = (radius: number) => {
    const safeRadius = Math.max(50, Math.min(3000, radius));
    setAssessment(null);
    commit((current) => ({
      ...current,
      patients: current.patients.map((item) =>
        item.id === patient.id ? { ...item, safe_zone_radius: safeRadius } : item
      ),
      places: current.places.map((place) =>
        place.type === "home" ? { ...place, risk_radius_m: safeRadius } : place
      )
    }));
  };

  const updatePlaceRisk = (placeId: string, safety: "safe" | "neutral" | "risky") => {
    commit((current) => ({
      ...current,
      places: current.places.map((place) => (place.id === placeId ? { ...place, safety_level: safety } : place))
    }));
  };

  const postLocationPing = async (latitude: number, longitude: number, message: string) => {
    const data = await fetch("/api/watch/location", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patient.id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        message
      })
    }).then((res) => res.json());
    if (data.geofence) setAssessment(data.geofence);
  };

  const simulateWatchPoint = async (kind: "safe" | "risky") => {
    const point =
      kind === "risky"
        ? state.places.find((place) => place.safety_level === "risky" && place.latitude && place.longitude)
        : state.places.find((place) => place.id === "place_temple" && place.latitude && place.longitude);
    if (!point?.latitude || !point.longitude) return;
    setLoading(true);
    try {
      await postLocationPing(
        point.latitude,
        point.longitude,
        kind === "risky" ? "Simulated Galaxy Watch GPS near risky road." : "Simulated Galaxy Watch GPS near a known safe place."
      );
      setLatestLocation({
        patient_id: patient.id,
        latitude: point.latitude,
        longitude: point.longitude,
        captured_at: new Date().toISOString(),
        source: "wearos"
      });
    } finally {
      setLoading(false);
    }
  };

  const body = (
    <>
      <SectionHeader
        eyebrow="SafePath"
        title="Live geofence and care map"
        body="Safe places, risky places, browser or phone GPS, calming patient cue, caregiver alert, and CareCircle dispatch."
        action={
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={useBrowserGps}>
              <LocateFixed size={16} />
              Use browser GPS
            </Button>
            <Button onClick={runSimulation} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Navigation size={16} />}
              Simulate safe-zone exit
            </Button>
            <Button variant="secondary" onClick={() => void simulateWatchPoint("risky")} disabled={loading}>
              <ShieldAlert size={16} />
              Watch ping risky road
            </Button>
          </div>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="self-start overflow-hidden p-0">
          <div className="border-b border-[#24201c]/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Care map</p>
                <h2 className="mt-1 font-display text-3xl">MSRIT neighbourhood</h2>
              </div>
              <Badge tone="privacy">Map + GPS</Badge>
            </div>
          </div>
          {mapEnabled ? (
            <SafeMap latestLocation={state.latestLocation} safeZoneRadius={patient.safe_zone_radius} places={state.places} />
          ) : (
            <div className="flex h-[min(420px,55vh)] min-h-[260px] flex-col items-center justify-center gap-3 bg-[#ede4d6] px-6 text-center">
              <p className="text-sm font-bold text-[#746b61]">Map loads after first paint to keep the phone UI snappy.</p>
              <Button onClick={() => setMapEnabled(true)}>Show map now</Button>
            </div>
          )}
          <div className="border-t border-[#24201c]/10 p-5">
            <div className="mb-5 rounded-3xl bg-white/60 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Latest patient location</p>
              {state.latestLocation ? (
                <div className="mt-2 space-y-1 text-sm leading-6 text-[#746b61]">
                  <p>
                    <strong className="text-[#24201c]">{state.latestLocation.latitude.toFixed(5)}, {state.latestLocation.longitude.toFixed(5)}</strong>
                    {" · "}
                    source <strong className="text-[#24201c]">{state.latestLocation.source || "unknown"}</strong>
                  </p>
                  <p>
                    {Math.round(latestDistance)}m from home · geofence{" "}
                    <strong className="text-[#24201c]">
                      {state.latestLocation.geofence_status || (latestDistance <= patient.safe_zone_radius ? "inside" : "outside")}
                    </strong>
                    {state.latestLocation.captured_at
                      ? ` · ${new Date(state.latestLocation.captured_at).toLocaleString("en-IN")}`
                      : null}
                  </p>
                  <p className="text-xs">
                    Home is seeded near MSRIT/Mathikere. A real watch GPS from Marathahalli will plot outside the safe zone and still appear on this map (pan/zoom).
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[#746b61]">
                  No watch or phone GPS yet. Tap <strong>Send GPS</strong> on the watch, or <strong>Use browser GPS</strong> here.
                </p>
              )}
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Place risk controls</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {state.places.map((place) => (
                <div key={place.id} className="rounded-3xl bg-white/55 p-4">
                  <p className="font-semibold leading-tight">{place.name}</p>
                  <p className="mt-1 min-h-5 text-xs text-[#746b61]">{place.location}</p>
                  <select
                    className="mt-3 w-full rounded-full border border-[#24201c]/10 bg-[#fff8eb] px-3 py-2 text-xs font-bold"
                    value={place.safety_level}
                    onChange={(event) => updatePlaceRisk(place.id, event.target.value as "safe" | "neutral" | "risky")}
                  >
                    <option value="safe">Safe</option>
                    <option value="neutral">Neutral</option>
                    <option value="risky">Risky</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <LumoOrb cue={assessment?.patient_message || "You are safe. Please stay near a familiar place. Ananya can be contacted when you need help."} />
          <Card>
            <div className="mb-4 rounded-3xl bg-white/52 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#3f4d7a]">
                <SlidersHorizontal size={16} />
                Safe-zone radius
              </div>
              <input
                aria-label="Safe-zone radius"
                className="mt-4 w-full accent-[#3f4d7a]"
                type="range"
                min={100}
                max={2000}
                step={50}
                value={patient.safe_zone_radius}
                onChange={(event) => updateRadius(Number(event.target.value))}
              />
              <div className="mt-2 flex items-center justify-between text-xs font-bold text-[#746b61]">
                <span>100m</span>
                <span>{patient.safe_zone_radius}m active radius</span>
                <span>2km</span>
              </div>
            </div>
            <div className="mb-4 rounded-3xl bg-white/52 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#3f4d7a]">
                <MapPin size={16} />
                Latest location
              </div>
              <p className="mt-2 text-sm leading-6 text-[#746b61]">
                {state.latestLocation
                  ? `${state.latestLocation.latitude.toFixed(5)}, ${state.latestLocation.longitude.toFixed(5)} - ${latestDistance}m from home safe zone center`
                  : "Use phone GPS, browser GPS, watch ping, or simulation."}
              </p>
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Caregiver alert preview</p>
            <h2 className="mt-2 font-display text-3xl">{assessment?.risk_level || "low"} risk</h2>
            <p className="mt-3 text-sm leading-6 text-[#746b61]">
              {assessment?.caregiver_message ||
                "Rajamma is currently inside routine. Simulate an exit to create an alert and neighbour task."}
            </p>
            <div className="mt-4 rounded-3xl bg-[#3f4d7a]/10 p-4 text-sm leading-6 text-[#3f4d7a]">
              {assessment?.community_action || "Nearest trusted helpers and safe places will appear here."}
            </div>
          </Card>
        </div>
      </div>
    </>
  );

  return (
    <PhoneOrDesktopShell
      mobileTitle="SafePath"
      mobileEyebrow="Geofence"
      desktop={(children) => (
        <AppShell
          sidebarAfter={
            <SafePathSidebarAlerts
              alerts={state.alerts.slice(0, 3)}
              watchMessage={assessment?.caregiver_message || "Rajamma is inside the safe zone."}
            />
          }
        >
          {children}
        </AppShell>
      )}
    >
      {body}
    </PhoneOrDesktopShell>
  );
}

function SafePathSidebarAlerts({ alerts, watchMessage }: { alerts: Alert[]; watchMessage: string }) {
  return (
    <section className="space-y-4">
      <WatchMock message={watchMessage} />
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Recent SafePath alerts</p>
            <h3 className="mt-2 font-display text-2xl">CareGrid Alert Log</h3>
          </div>
          <Badge tone="warn">{alerts.length}</Badge>
        </div>
        <div className="mt-4 space-y-3">
          {alerts.length ? (
            alerts.map((alert) => (
              <div key={alert.id} className="rounded-3xl bg-white/55 p-4">
                <Badge tone={alert.severity === "critical" || alert.severity === "high" ? "danger" : "warn"}>{alert.severity}</Badge>
                <p className="mt-3 text-sm font-semibold leading-6">{alert.message}</p>
              </div>
            ))
          ) : (
            <p className="rounded-3xl bg-white/55 p-4 text-sm leading-6 text-[#746b61]">
              SafePath alerts will appear here after an SOS, risky-road ping, or geofence exit.
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}
