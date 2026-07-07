import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { X, AlertTriangle, Inbox, Star } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
    secondary:
      "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
    ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-70",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

/* ---------- form fields ---------- */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn("mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300", className)}>{children}</label>;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- surfaces ---------- */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue" | "brand";
  className?: string;
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    brand: "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function statusTone(status?: string): "slate" | "green" | "amber" | "red" | "blue" {
  switch (status) {
    case "Sent":
    case "Approved":
    case "Resolved":
    case "Present":
    case "Read":
    case "Responded":
    case "Closed":
      return "green";
    case "Open":
    case "Pending":
    case "Draft":
    case "Unread":
    case "In Review":
      return "amber";
    case "Failed":
    case "Rejected":
    case "Absent":
      return "red";
    case "Leave":
      return "blue";
    default:
      return "slate";
  }
}

/* ---------- states ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800", className)} />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="text-slate-300 dark:text-slate-700">{icon ?? <Inbox size={40} />}</div>
      <p className="font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const status = (error as { status?: number })?.status;
  const message =
    status === 403
      ? "You don't have access to this information. If your role recently changed, it may take a moment to reflect."
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertTriangle size={36} className="text-amber-500" />
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">{message}</p>
      {retry && status !== 403 && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* ---------- modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={ref}
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- tabs ---------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; badge?: number }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto pb-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active === t.key
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          {t.label}
          {t.badge !== undefined && t.badge > 0 && (
            <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- stars ---------- */

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(value) ? "fill-accent-500 text-accent-500" : "text-slate-300 dark:text-slate-700"}
        />
      ))}
    </span>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
