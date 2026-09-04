"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  BookOpen,
  HeartHandshake,
  Map,
  QrCode,
  ShieldCheck,
  Smartphone,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
  hidden?: boolean;
}> = [
  { href: "/community-app", label: "App", icon: Smartphone },
  { href: "/safe-path", label: "Safe", icon: Map },
  { href: "/memory-capture", label: "Guard", icon: ShieldCheck },
  { href: "/care-circle", label: "Tasks", icon: HeartHandshake },
  { href: "/carelearn", label: "Learn", icon: BookOpen },
  {
    href: "/rescue/patient_rajamma",
    label: "Rescue",
    icon: QrCode,
    match: (path) => path.startsWith("/rescue")
  }
];

const visibleTabs = tabs.filter((item) => !item.hidden);

function isCareGridMobileWebView() {
  if (typeof navigator === "undefined") return false;
  return /RememberMeCareGridMobile/i.test(navigator.userAgent || "");
}

/** Bottom tabs for phone WebView — full nav on WebView (reliable), soft nav on desktop. */
export function MobileTabBar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const webView = useMemo(() => isCareGridMobileWebView(), []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#24201c]/10 bg-[#fffaf1]/98 px-2 pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_44px_rgba(36,32,28,0.12)]">
      {(pending || pendingHref) && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-[#e9ba66]/30">
          <div className="h-full w-1/2 animate-pulse bg-[#e9ba66]" />
        </div>
      )}
      <div className="mx-auto grid max-w-xl grid-cols-6 gap-1">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = pendingHref
            ? item.href === pendingHref
            : activeHref
              ? item.href === activeHref
              : item.match
                ? item.match(pathname)
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                setPendingHref(item.href);
                // WebView over ngrok: full document navigation + cached /_next/static is more reliable.
                if (webView) {
                  // Allow default <a> navigation (do not preventDefault).
                  return;
                }
                event.preventDefault();
                startTransition(() => {
                  router.push(item.href);
                });
              }}
              className={cn(
                "flex min-h-12 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold text-[#746b61] select-none",
                active && "bg-[#24201c] text-[#fff8eb] shadow-sm"
              )}
            >
              <Icon size={18} />
              <span className="max-w-full truncate">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
