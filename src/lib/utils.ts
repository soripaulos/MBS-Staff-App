import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function pct(score: number, max: number): number {
  return max > 0 ? (score / max) * 100 : 0;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Frappe Rating fields store 0..1; the UI convention is 5 stars. */
export function ratingToStars(v: number | null | undefined): number {
  return round1((v ?? 0) * 5);
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stripHtml(html?: string | null): string {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}
