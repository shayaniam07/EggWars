"use client";

/** EGG WARS - Shared UI atoms (dark arcade theme, mobile-first). */
import { useEffect, useState, type ReactNode } from "react";
import { RARITY_META, type Rarity } from "@/shared/catalog";

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Btn({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  className,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "gold" | "diamond" | "dark";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
  type?: "button" | "submit";
}) {
  const base =
    "relative inline-flex items-center justify-center gap-2 rounded-xl font-bold tracking-wide transition-all duration-150 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-45 select-none";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3.5 text-base" };
  const variants = {
    primary: "bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-[0_6px_0_#0c4a6e,0_10px_20px_rgba(2,132,199,.35)] hover:from-sky-300 hover:to-sky-500 active:shadow-[0_2px_0_#0c4a6e]",
    gold: "bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_6px_0_#78350f,0_10px_20px_rgba(245,158,11,.35)] hover:from-amber-200 hover:to-amber-400 active:shadow-[0_2px_0_#78350f]",
    diamond: "bg-gradient-to-b from-cyan-300 to-cyan-500 text-cyan-950 shadow-[0_6px_0_#164e63,0_10px_20px_rgba(34,211,238,.3)] active:shadow-[0_2px_0_#164e63]",
    danger: "bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-[0_6px_0_#7f1d1d] active:shadow-[0_2px_0_#7f1d1d]",
    ghost: "bg-white/5 text-slate-200 ring-1 ring-white/15 hover:bg-white/10",
    dark: "bg-slate-900/80 text-slate-100 ring-1 ring-white/10 hover:bg-slate-800",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function Panel({ children, className, title, right }: { children: ReactNode; className?: string; title?: string; right?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-white/10 bg-slate-900/70 p-4 backdrop-blur-xl", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-extrabold uppercase tracking-[.14em] text-slate-300">{title}</h3>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cn(
          "ew-pop flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-950/95 shadow-2xl sm:rounded-3xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <h2 className="text-base font-extrabold uppercase tracking-[.12em] text-amber-300">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </header>
        <div className="ew-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="shrink-0 border-t border-white/10 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function RarityChip({ rarity, className }: { rarity: Rarity; className?: string }) {
  const meta = RARITY_META[rarity] ?? RARITY_META.common;
  return (
    <span
      className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider", className)}
      style={{ color: meta.color, background: `${meta.color}1f`, boxShadow: `inset 0 0 0 1px ${meta.color}55` }}
    >
      {meta.label}
    </span>
  );
}

/**
 * Item thumbnail. When an uploaded icon fails to load we show the item's emoji
 * plus a visible warning badge — we never silently swap in a random image.
 */
export function ItemIcon({
  emoji,
  iconUrl,
  color,
  size = 56,
  name,
}: {
  emoji: string;
  iconUrl?: string | null;
  color?: string;
  size?: number;
  name?: string;
}) {
  // Track which URL failed instead of resetting state in an effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = Boolean(iconUrl) && failedUrl === iconUrl;
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-white/10"
      style={{ width: size, height: size, background: `linear-gradient(145deg, ${color ?? "#334155"}33, #0f172a)` }}
    >
      {iconUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={name ?? "item icon"}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailedUrl(iconUrl ?? null)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{emoji}</span>
      )}
      {iconUrl && failed && (
        <span
          title="Icon file could not be loaded — showing fallback"
          className="absolute bottom-0 right-0 bg-rose-600/90 px-1 text-[9px] font-bold text-white"
        >
          !
        </span>
      )}
    </div>
  );
}

export function Pill({ icon, value, tone = "gold" }: { icon: string; value: number | string; tone?: "gold" | "diamond" | "slate" }) {
  const tones = {
    gold: "from-amber-500/25 to-amber-700/10 text-amber-200 ring-amber-400/30",
    diamond: "from-cyan-400/25 to-cyan-700/10 text-cyan-200 ring-cyan-300/30",
    slate: "from-slate-500/25 to-slate-700/10 text-slate-200 ring-white/15",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b px-2.5 py-1 text-xs font-bold ring-1", tones[tone])}>
      <span>{icon}</span>
      {typeof value === "number" ? value.toLocaleString() : value}
    </span>
  );
}

export function Bar({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${pct}%`, background: color }} title={label} />
    </div>
  );
}

export function Toasts({ items }: { items: { id: number; text: string; tone?: string }[] }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "ew-pop rounded-xl border px-4 py-2.5 text-center text-sm font-semibold shadow-xl backdrop-blur",
            t.tone === "error"
              ? "border-rose-400/40 bg-rose-950/90 text-rose-100"
              : "border-emerald-400/30 bg-slate-900/90 text-emerald-100",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none ring-sky-400/0 transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/30";
