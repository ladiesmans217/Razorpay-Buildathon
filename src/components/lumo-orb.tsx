"use client";

import { Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui";

export function LumoOrb({ cue, large = false }: { cue: string; large?: boolean }) {
  const speak = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cue);
    utterance.rate = 0.86;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/50 bg-[#24201c] p-5 text-[#fff8eb] shadow-[0_30px_90px_rgba(36,32,28,0.24)]">
      <div className="absolute right-[-4rem] top-[-5rem] h-56 w-56 rounded-full bg-[#e9ba66]/20 blur-3xl" />
      <div className="relative flex items-center gap-5">
        <motion.div
          className={large ? "size-28" : "size-20"}
          animate={{ scale: [1, 1.04, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff8eb,#e9ba66_34%,#7d6aa8_74%,#3f4d7a)] shadow-[0_0_60px_rgba(233,186,102,0.32)]">
            <span className="font-display text-2xl text-[#24201c]">Lu</span>
          </div>
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-[#e9ba66]">Lumo Companion</p>
          <p className={large ? "mt-3 text-2xl leading-9" : "mt-2 text-lg leading-7"}>{cue}</p>
          <Button className="mt-4 bg-[#fff8eb] text-[#24201c] hover:bg-white" onClick={speak}>
            <Volume2 size={16} />
            Speak softly
          </Button>
        </div>
      </div>
    </div>
  );
}
