"use client";

import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatestLocation, PlaceMemory } from "@/lib/types";
import { safePathPlaces } from "@/lib/safepath";
import type { SafeMapProps } from "./safe-map";

function makeDivIcon(label: string, bg: string, textColor: string, size = 36) {
  return L.divIcon({
    className: "caregrid-map-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:${textColor};border:3px solid #fffaf1;display:grid;place-items:center;font-weight:900;font-size:12px;box-shadow:0 12px 28px rgba(36,32,28,0.28);">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

const patientIcon = makeDivIcon("R", "#3f4d7a", "#fff8eb", 42);
const safeIcon = makeDivIcon("✓", "#6f8b78", "#fff8eb");
const riskIcon = makeDivIcon("!", "#bc6f55", "#fff8eb");
const neutralIcon = makeDivIcon("·", "#e9ba66", "#24201c");

function FitAndFixSize({
  home,
  patient,
  places
}: {
  home: { latitude: number; longitude: number };
  patient: { latitude: number; longitude: number };
  places: Array<{ latitude: number; longitude: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [
      [home.latitude, home.longitude],
      [patient.latitude, patient.longitude],
      ...places.map((p) => [p.latitude, p.longitude] as L.LatLngExpression)
    ];
    const apply = () => {
      map.invalidateSize({ animate: false });
      if (points.length === 1) {
        map.setView(points[0], 15);
        return;
      }
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15, animate: false });
    };
    apply();
    // WebView often lays out late — re-invalidate size.
    const t1 = window.setTimeout(apply, 120);
    const t2 = window.setTimeout(apply, 500);
    const t3 = window.setTimeout(apply, 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [map, home.latitude, home.longitude, patient.latitude, patient.longitude, places]);

  return null;
}

export function SafeMapClient({ latestLocation, safeZoneRadius, places = [] }: SafeMapProps) {
  const homePlace = places.find((place) => place.type === "home" && typeof place.latitude === "number" && typeof place.longitude === "number");
  const homeCenter = homePlace
    ? { latitude: homePlace.latitude!, longitude: homePlace.longitude! }
    : safePathPlaces.home;

  const patient: LatestLocation = latestLocation || {
    latitude: homeCenter.latitude,
    longitude: homeCenter.longitude,
    source: "simulated",
    captured_at: new Date().toISOString(),
    patient_id: "patient_rajamma"
  };

  const positionedPlaces: PlaceMemory[] = useMemo(() => {
    const mapped = places.filter((place) => typeof place.latitude === "number" && typeof place.longitude === "number");
    if (mapped.length) return mapped;
    return Object.values(safePathPlaces).map((place) => ({
      id: place.name,
      patient_id: "patient_rajamma",
      name: place.name,
      type: "park" as PlaceMemory["type"],
      location: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      safety_level: place.safety,
      notes: "",
      last_visit_at: "",
      usual_companions: []
    }));
  }, [places]);

  const placePoints = useMemo(
    () =>
      positionedPlaces
        .filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number")
        .map((p) => ({ latitude: p.latitude!, longitude: p.longitude! })),
    [positionedPlaces]
  );

  const center: [number, number] = [homeCenter.latitude, homeCenter.longitude];

  return (
    <div className="relative h-[min(560px,70vh)] min-h-[320px] w-full overflow-hidden rounded-b-[32px] bg-[#ede4d6]">
      <MapContainer
        center={center}
        zoom={15}
        className="z-0 h-full w-full"
        scrollWheelZoom
        dragging
        touchZoom
        doubleClickZoom
        zoomControl
        style={{ height: "100%", width: "100%", touchAction: "none" }}
      >
        {/* Carto tiles are more reliable in some WebViews than tile.openstreetmap.org */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />
        <FitAndFixSize home={homeCenter} patient={patient} places={placePoints} />
        <Circle
          center={[homeCenter.latitude, homeCenter.longitude]}
          radius={safeZoneRadius}
          pathOptions={{
            color: "#6f8b78",
            fillColor: "#6f8b78",
            fillOpacity: 0.14,
            weight: 2
          }}
        />
        {positionedPlaces.map((place) => {
          const icon =
            place.safety_level === "risky" ? riskIcon : place.safety_level === "neutral" ? neutralIcon : safeIcon;
          return (
            <Marker key={place.id} position={[place.latitude!, place.longitude!]} icon={icon}>
              <Popup>
                <strong>{place.name}</strong>
                <br />
                {place.safety_level} · {place.type}
              </Popup>
            </Marker>
          );
        })}
        <Marker position={[patient.latitude, patient.longitude]} icon={patientIcon}>
          <Popup>
            <strong>Rajamma</strong>
            <br />
            {patient.source || "unknown"} · {patient.latitude.toFixed(5)}, {patient.longitude.toFixed(5)}
            {typeof patient.distance_from_home_m === "number" ? (
              <>
                <br />
                {Math.round(patient.distance_from_home_m)}m from home · {patient.geofence_status || "—"}
              </>
            ) : null}
          </Popup>
        </Marker>
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-full bg-[#fffaf1]/90 px-3 py-1 text-[10px] font-bold text-[#746b61] shadow-sm">
        Drag / pinch · CareGrid geofence
      </div>
    </div>
  );
}
