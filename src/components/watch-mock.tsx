"use client";

import { Bell, Check, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui";

export function WatchMock({ message }: { message: string }) {
  const vibrate = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([160, 80, 160]);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[260px] rounded-[42px] border-[10px] border-[#24201c] bg-[#1f1c19] p-4 text-[#fff8eb] shadow-[0_24px_70px_rgba(36,32,28,0.25)]">
      <div className="rounded-[30px] bg-[#fff8eb] p-4 text-[#24201c]">
        <div className="flex items-center justify-between">
          <span className="grid size-10 place-items-center rounded-full bg-[#bc6f55]/16 text-[#bc6f55]">
            <HeartPulse size={18} />
          </span>
          <span className="text-xs font-bold">11:42</span>
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">CareGrid Alert</p>
        <p className="mt-2 text-sm leading-5">{message}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button className="min-h-10 px-3 text-xs" onClick={vibrate}>
            <Bell size={14} />
            Vibrate
          </Button>
          <Button variant="secondary" className="min-h-10 px-3 text-xs">
            <Check size={14} />
            Acknowledge
          </Button>
        </div>
      </div>
    </div>
  );
}
