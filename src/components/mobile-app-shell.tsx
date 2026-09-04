"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { cn } from "@/lib/utils";

function isCareGridMobileWebView() {
  if (typeof navigator === "undefined") return false;
  return /RememberMeCareGridMobile/i.test(navigator.userAgent || "");
}

/** Lightweight phone shell: no desktop sidebar, rewards, or heavy nav. */
export function MobileAppShell({
  children,
  title = "CareGrid",
  eyebrow = "RememberMe",
  className
}: {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-h-screen bg-[#f7f3eb] pb-[calc(5.75rem+env(safe-area-inset-bottom))] text-[#24201c]", className)}>
      <header className="sticky top-0 z-40 border-b border-[#24201c]/10 bg-[#fffaf1]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/community-app"
            className="grid size-10 place-items-center rounded-full bg-[#24201c] text-[#fff8eb] shadow"
          >
            <ShieldCheck size={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#bc6f55]">{eyebrow}</p>
            <h1 className="truncate font-display text-xl leading-tight">{title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-4">{children}</main>
      <MobileTabBar />
    </div>
  );
}

/** Prefer mobile shell in WebView; otherwise use desktop AppShell. */
export function useIsMobileWebView() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(isCareGridMobileWebView());
  }, []);
  return mobile;
}

export function PhoneOrDesktopShell({
  mobileTitle,
  mobileEyebrow,
  desktop,
  children
}: {
  mobileTitle?: string;
  mobileEyebrow?: string;
  desktop: (body: ReactNode) => ReactNode;
  children: ReactNode;
}) {
  const mobile = useIsMobileWebView();
  if (mobile) {
    return (
      <MobileAppShell title={mobileTitle} eyebrow={mobileEyebrow}>
        {children}
      </MobileAppShell>
    );
  }
  return <>{desktop(children)}</>;
}
