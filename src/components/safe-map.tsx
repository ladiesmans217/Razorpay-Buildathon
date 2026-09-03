"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LatestLocation, PlaceMemory } from "@/lib/types";

export interface SafeMapProps {
  latestLocation?: LatestLocation;
  safeZoneRadius: number;
  places?: PlaceMemory[];
}

function MapShell({ children, hint }: { children?: React.ReactNode; hint: string }) {
  return (
    <div className="relative flex h-[min(560px,70vh)] min-h-[320px] flex-col items-center justify-center gap-3 overflow-hidden rounded-b-[32px] bg-[#ede4d6] px-6 text-center text-sm font-bold text-[#746b61]">
      {children || <p>{hint}</p>}
    </div>
  );
}

const SafeMapDynamic = dynamic(() => import("./safe-map-client").then((mod) => mod.SafeMapClient), {
  ssr: false,
  loading: () => <MapShell hint="Loading interactive map…" />
});

/** Interactive Leaflet map (client-only). Pan, zoom, and touch-drag enabled. */
export function SafeMap(props: SafeMapProps) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowHelp(true), 10000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      <SafeMapDynamic {...props} />
      {showHelp ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[1100] flex justify-center px-3">
          <p className="pointer-events-auto max-w-md rounded-full bg-[#24201c]/88 px-3 py-1.5 text-center text-[10px] font-bold text-[#fff8eb]">
            Map still blank? Reload page. Keep ngrok + production server (`npm run demo`) running.
            {" · "}
            <a href="/safe-path" className="underline">
              Reload
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
