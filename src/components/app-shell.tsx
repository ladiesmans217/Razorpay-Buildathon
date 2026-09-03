"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award,
  BookOpen,
  Brain,
  Camera,
  CircleUserRound,
  FileText,
  HeartHandshake,
  Home,
  Gift,
  Map,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Watch,
  X
} from "lucide-react";
import { useCareStore } from "@/lib/care-store";
import { Badge, Button } from "@/components/ui";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { cn, uid } from "@/lib/utils";
import { DEMO_PATIENT_ID } from "@/lib/seed";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/patient", label: "Patient", icon: CircleUserRound },
  { href: "/enroll", label: "Enroll", icon: Users },
  // Hidden from website nav (routes still work): Lumo Live, SmritiLens, Phone Cam, Watch
  { href: "/live", label: "Lumo Live", icon: Sparkles, hiddenInNav: true },
  { href: "/lens", label: "SmritiLens", icon: Camera, hiddenInNav: true },
  { href: "/mobile-camera", label: "Phone Cam", icon: Smartphone, hiddenInNav: true },
  { href: "/memory-capture", label: "Memory Guard", icon: ShieldCheck },
  { href: "/caregiver", label: "Caregiver", icon: Brain },
  { href: "/safe-path", label: "SafePath", icon: Map },
  { href: "/watch", label: "Watch", icon: Watch, hiddenInNav: true },
  { href: "/care-circle", label: "CareCircle", icon: HeartHandshake },
  { href: "/carelearn", label: "CareLearn", icon: BookOpen },
  { href: "/doctor-report", label: "Doctor Brief", icon: FileText }
] as const;

const visibleNav = nav.filter((item) => !("hiddenInNav" in item && item.hiddenInNav));

// Mobile bottom tabs live in MobileTabBar (prefetch + instant pending UI).

const rewardItems = [
  {
    title: "Pharmacy refill coupon",
    partner: "Local pharmacy",
    cost: 2000,
    copy: "Redeem for a caregiver-approved medicine delivery discount."
  },
  {
    title: "Safe return cab voucher",
    partner: "RWA safety fund",
    cost: 3500,
    copy: "Use during a verified SafePath incident or doctor visit."
  },
  {
    title: "CareLearn completion kit",
    partner: "CareLearn",
    cost: 1500,
    copy: "Printable completion pack for ASHA, RWA, and student volunteer training."
  },
  {
    title: "Caregiver respite voucher",
    partner: "Community partner",
    cost: 5000,
    copy: "A small sponsored break for the primary caregiver."
  },
  {
    title: "Home safety kit",
    partner: "RWA store",
    cost: 4500,
    copy: "Door labels, ID card sleeves, and safe-route stickers."
  },
  {
    title: "Grocery support card",
    partner: "Neighbourhood store",
    cost: 2500,
    copy: "Monthly essentials support after repeated learning streaks."
  }
];

export function AppShell({ children, sidebarAfter }: { children: React.ReactNode; sidebarAfter?: React.ReactNode }) {
  const pathname = usePathname();
  const { state, isFirebase, resetDemo, commit } = useCareStore();
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [rewardNote, setRewardNote] = useState("Complete CareLearn lessons (+120), CareCircle tasks, and keep a care streak.");
  const rewardPoints = state.rewardPoints ?? 300;
  const badges = state.careBadges || [];
  const streak = state.careStreakDays || 0;

  const redeemReward = (reward: (typeof rewardItems)[number]) => {
    if (rewardPoints < reward.cost) {
      setRewardNote(`Need ${reward.cost - rewardPoints} more points for ${reward.title}.`);
      return;
    }
    commit(
      (current) => ({
        ...current,
        rewardPoints: Math.max(0, (current.rewardPoints ?? 300) - reward.cost),
        rewardTransactions: [
          {
            id: uid("reward_redeem"),
            patient_id: DEMO_PATIENT_ID,
            points: -reward.cost,
            reason: `Redeemed ${reward.title}.`,
            source: "redeem",
            created_at: new Date().toISOString()
          },
          ...(current.rewardTransactions || [])
        ]
      }),
      "Reward redeemed"
    );
    setRewardNote(`${reward.title} redeemed for ${reward.cost} points.`);
  };

  return (
    <div className="app-shell care-grid pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="sticky top-0 z-50 border-b border-[#24201c]/10 bg-[#f7f3eb]/90 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-[#24201c] text-[#fff8eb] shadow-lg">
              <ShieldCheck size={20} />
            </span>
            <span>
              <span className="block font-display text-xl leading-none">RememberMe</span>
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#746b61]">CareGrid</span>
            </span>
          </Link>
          <div className="hidden items-center gap-2 lg:flex">
            {/* slice(1) drops Home (logo already links home); keep Doctor Brief as last item */}
            {visibleNav.slice(1).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#746b61] transition hover:bg-white/60 hover:text-[#24201c]",
                    active && "bg-white text-[#24201c] shadow-sm"
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#e9ba66]/40 bg-[#fff4cf] px-3 py-1 text-xs font-black text-[#7b5a15] shadow-sm"
              onClick={() => setRewardsOpen(true)}
            >
              <Gift size={15} />
              {rewardPoints} pts
            </button>
            <Badge tone={isFirebase ? "safe" : "warn"}>{isFirebase ? "Firebase live" : "Demo mode"}</Badge>
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={resetDemo}>
              <RotateCcw size={16} />
              Reset
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-5 px-4 py-5 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main>{children}</main>
        <aside className="space-y-4">
          <section className="ink-panel overflow-hidden rounded-[28px] p-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e9ba66]">Care Memory Graph</p>
            <h3 className="mt-3 font-display text-3xl">Three rings of care</h3>
            <div className="mt-5 grid gap-3">
              {[
                ["Patient", "Lumo, SmritiLens, SafePath"],
                ["Family", "Dashboard, alerts, doctor brief"],
                ["Community", "Neighbour, ASHA, pharmacy, RWA, CareLearn"]
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/7 p-3">
                  <p className="text-sm font-bold">{title}</p>
                  <p className="mt-1 text-sm text-[#fff8eb]/66">{copy}</p>
                </div>
              ))}
            </div>
          </section>
          {sidebarAfter}
        </aside>
      </div>

      <div className="lg:hidden">
        <MobileTabBar />
      </div>

      {rewardsOpen ? (
        <div className="fixed inset-0 z-[80] bg-[#24201c]/42 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex max-h-[92vh] max-w-5xl flex-col overflow-hidden rounded-[32px] border border-white/50 bg-[#fffaf1] shadow-[0_30px_100px_rgba(36,32,28,0.32)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#24201c]/10 p-5">
              <div>
                <Badge tone="warn">CareLearn rewards</Badge>
                <h2 className="mt-3 font-display text-4xl leading-tight">Reward wallet</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#746b61]">
                  CareLearn lessons, CareCircle help, and daily care activity earn points and badges. Light gamification for the care circle — not the main product.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-3xl bg-[#24201c] px-5 py-3 text-[#fff8eb]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#e9ba66]">Balance</p>
                  <p className="font-display text-3xl">{rewardPoints}</p>
                  <p className="mt-1 text-xs font-semibold text-[#e9ba66]/80">{streak}-day streak</p>
                </div>
                <button className="grid size-11 place-items-center rounded-full bg-[#24201c]/8" onClick={() => setRewardsOpen(false)} aria-label="Close rewards">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              <div className="mb-4 rounded-3xl bg-[#6f8b78]/12 p-4 text-sm font-semibold leading-6 text-[#476353]">
                {rewardNote}
              </div>
              {badges.length ? (
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#bc6f55]">Badges earned</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {badges.map((badge) => (
                      <div key={badge.id} className="rounded-3xl border border-[#24201c]/10 bg-white/70 px-4 py-3">
                        <p className="font-semibold text-[#24201c]">{badge.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[#746b61]">{badge.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rewardItems.map((reward) => {
                  const canRedeem = rewardPoints >= reward.cost;
                  return (
                    <div key={reward.title} className="rounded-[28px] border border-[#24201c]/10 bg-white/60 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid size-11 place-items-center rounded-2xl bg-[#e9ba66]/24 text-[#7b5a15]">
                          {canRedeem ? <Award size={19} /> : <Gift size={19} />}
                        </span>
                        <Badge tone={canRedeem ? "safe" : "neutral"}>{reward.cost} pts</Badge>
                      </div>
                      <h3 className="mt-4 font-display text-2xl">{reward.title}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#bc6f55]">{reward.partner}</p>
                      <p className="mt-3 text-sm leading-6 text-[#746b61]">{reward.copy}</p>
                      <button
                        className={cn(
                          "mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-full px-4 text-sm font-bold transition",
                          canRedeem ? "bg-[#24201c] text-[#fff8eb]" : "bg-[#24201c]/8 text-[#746b61]"
                        )}
                        onClick={() => redeemReward(reward)}
                      >
                        {canRedeem ? "Redeem" : `Need ${reward.cost - rewardPoints} more`}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 rounded-3xl bg-[#7d6aa8]/10 p-4 text-sm leading-6 text-[#5a4b78]">
                Recent activity: {(state.rewardTransactions || []).slice(0, 3).map((item) => `${item.points > 0 ? "+" : ""}${item.points} ${item.reason}`).join("  ")}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
