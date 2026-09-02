export const safePathPlaces = {
  home: {
    name: "Rajamma home",
    latitude: 13.0306,
    longitude: 77.565,
    safety: "safe"
  },
  temple: {
    name: "Ramaiah temple gate",
    latitude: 13.0321,
    longitude: 77.5664,
    safety: "safe"
  },
  pharmacy: {
    name: "Local pharmacy",
    latitude: 13.0288,
    longitude: 77.5634,
    safety: "safe"
  },
  park: {
    name: "Park bench",
    latitude: 13.0297,
    longitude: 77.5617,
    safety: "safe"
  },
  road: {
    name: "Busy main road",
    latitude: 13.0319,
    longitude: 77.5701,
    safety: "risky"
  }
} as const;

export function distanceMeters(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthRadius = 6371000;
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

export function placePoint(place?: { latitude?: number; longitude?: number }) {
  if (typeof place?.latitude === "number" && typeof place.longitude === "number") {
    return { latitude: place.latitude, longitude: place.longitude };
  }
  return null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
