import { distanceMeters, safePathPlaces } from "./safepath";
import type { AlertSeverity, CareState, LatestLocation, PlaceMemory } from "./types";

export interface GeofenceAssessment {
  status: "inside" | "outside";
  risk_level: AlertSeverity;
  distance_from_home_m: number;
  safe_zone_radius_m: number;
  nearest_safe_place?: {
    name: string;
    distance_m: number;
  };
  nearest_risky_place?: {
    name: string;
    distance_m: number;
  };
  should_sos: boolean;
  trigger_reason: "inside_safe_zone" | "outside_safe_zone" | "near_risky_place";
  caregiver_message: string;
  patient_message: string;
}

export function assessGeofence(state: CareState, location: LatestLocation): GeofenceAssessment {
  const patient = state.patients[0];
  const homePlace = state.places.find((place) => place.type === "home");
  const home = pointForPlace(homePlace) || safePathPlaces.home;
  const radius = patient?.safe_zone_radius || homePlace?.risk_radius_m || 500;
  const distanceFromHome = distanceMeters(location, home);
  const status: GeofenceAssessment["status"] = distanceFromHome <= radius ? "inside" : "outside";

  const safePlaces = state.places
    .filter((place) => place.safety_level === "safe" && place.type !== "home")
    .map((place) => withDistance(place, location))
    .filter(isMeasuredPlace)
    .sort((a, b) => a.distance_m - b.distance_m);

  const riskyPlaces = state.places
    .filter((place) => place.safety_level === "risky")
    .map((place) => withDistance(place, location))
    .filter(isMeasuredPlace)
    .sort((a, b) => a.distance_m - b.distance_m);

  const nearestSafe = safePlaces[0];
  const nearestRisky = riskyPlaces[0];
  const nearRisky = Boolean(nearestRisky && nearestRisky.distance_m <= (nearestRisky.place.risk_radius_m || 180));
  const nearSafe = Boolean(nearestSafe && nearestSafe.distance_m <= (nearestSafe.place.risk_radius_m || 160));

  const risk: AlertSeverity =
    nearRisky && status === "outside"
      ? "critical"
      : status === "outside" && !nearSafe
        ? "high"
        : status === "outside"
          ? "medium"
          : nearRisky
            ? "medium"
            : "low";

  const triggerReason =
    nearRisky && status === "outside" ? "near_risky_place" : status === "outside" ? "outside_safe_zone" : "inside_safe_zone";
  // Call/SMS caregiver when outside the home geofence, unless already standing in a known safe place.
  // Near-risky places while outside always SOS.
  const shouldSos = status === "outside" && (nearRisky || !nearSafe);
  const nearestSafeText = nearestSafe ? `${nearestSafe.place.name}, about ${nearestSafe.distance_m}m away` : "a familiar shop or safe place";
  const riskText = nearestRisky ? ` near ${nearestRisky.place.name}` : "";
  const mapLink = googleMapsLink(location);

  return {
    status,
    risk_level: risk,
    distance_from_home_m: distanceFromHome,
    safe_zone_radius_m: radius,
    nearest_safe_place: nearestSafe ? { name: nearestSafe.place.name, distance_m: nearestSafe.distance_m } : undefined,
    nearest_risky_place: nearestRisky ? { name: nearestRisky.place.name, distance_m: nearestRisky.distance_m } : undefined,
    should_sos: shouldSos,
    trigger_reason: triggerReason,
    caregiver_message:
      status === "inside"
        ? `${patient?.name || "Rajamma"} is inside the safe zone. Last location: ${mapLink}`
        : `${patient?.name || "Rajamma"} is ${distanceFromHome}m from home, outside the ${radius}m safe zone${riskText}. Nearest safe place: ${nearestSafeText}. Location: ${mapLink}`,
    patient_message:
      status === "inside"
        ? "You are inside the safe zone. You are doing okay."
        : "You are outside the safe zone. You are not alone. Please stop near a shop or familiar person. Ananya is being contacted. I am showing a help card on this watch now. If a kind bystander is nearby, show them the screen."
  };
}

export function googleMapsLink(location?: { latitude?: number; longitude?: number }) {
  if (typeof location?.latitude !== "number" || typeof location.longitude !== "number") return "No fresh GPS coordinates";
  return `https://maps.google.com/?q=${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
}

function pointForPlace(place?: PlaceMemory) {
  if (typeof place?.latitude === "number" && typeof place.longitude === "number") {
    return { latitude: place.latitude, longitude: place.longitude };
  }
  return null;
}

function withDistance(place: PlaceMemory, location: LatestLocation) {
  const point = pointForPlace(place);
  if (!point) return null;
  return {
    place,
    distance_m: distanceMeters(location, point)
  };
}

function isMeasuredPlace(value: ReturnType<typeof withDistance>): value is NonNullable<ReturnType<typeof withDistance>> {
  return Boolean(value);
}
