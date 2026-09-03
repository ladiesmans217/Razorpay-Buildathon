"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#3f4d7a]/30 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[#24201c] text-[#fff8eb] shadow-[0_14px_32px_rgba(36,32,28,0.20)] hover:bg-[#3a332d]",
        variant === "secondary" && "border border-[#24201c]/15 bg-white/60 text-[#24201c] hover:bg-white",
        variant === "ghost" && "text-[#24201c] hover:bg-[#24201c]/7",
        variant === "danger" && "bg-[#bc6f55] text-white shadow-[0_14px_32px_rgba(188,111,85,0.24)] hover:bg-[#a55f49]",
        className
      )}
      {...props}
    />
  );
}

export function LinkButton({
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#3f4d7a]/30",
        variant === "primary" && "bg-[#24201c] text-[#fff8eb] shadow-[0_14px_32px_rgba(36,32,28,0.20)] hover:bg-[#3a332d]",
        variant === "secondary" && "border border-[#24201c]/15 bg-white/60 text-[#24201c] hover:bg-white",
        variant === "ghost" && "text-[#24201c] hover:bg-[#24201c]/7",
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn("soft-panel rounded-[28px] p-5", className)}>{children}</section>;
}

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: ReactNode;
  tone?: "neutral" | "safe" | "warn" | "danger" | "indigo" | "privacy";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
        tone === "neutral" && "border-[#24201c]/10 bg-white/55 text-[#746b61]",
        tone === "safe" && "border-[#6f8b78]/20 bg-[#6f8b78]/12 text-[#476353]",
        tone === "warn" && "border-[#e9ba66]/30 bg-[#e9ba66]/22 text-[#7b5a15]",
        tone === "danger" && "border-[#bc6f55]/25 bg-[#bc6f55]/16 text-[#914d3c]",
        tone === "indigo" && "border-[#3f4d7a]/20 bg-[#3f4d7a]/12 text-[#33416d]",
        tone === "privacy" && "border-[#7d6aa8]/20 bg-[#7d6aa8]/12 text-[#5a4b78]",
        className
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  body,
  action
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-[#bc6f55]">{eyebrow}</p>}
        <h1 className="font-display text-3xl leading-tight text-[#24201c] md:text-5xl">{title}</h1>
        {body && <p className="mt-3 max-w-3xl text-sm leading-6 text-[#746b61] md:text-base">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "safe" | "warn" | "danger";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#746b61]">{label}</p>
        <Badge tone={tone === "neutral" ? "neutral" : tone}>{tone}</Badge>
      </div>
      <p className="mt-4 font-display text-3xl">{value}</p>
      <p className="mt-2 text-sm leading-5 text-[#746b61]">{detail}</p>
    </Card>
  );
}
