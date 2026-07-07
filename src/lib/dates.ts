const ETH_MONTHS = [
  "Meskerem",
  "Tikimt",
  "Hidar",
  "Tahsas",
  "Tir",
  "Yekatit",
  "Megabit",
  "Miazia",
  "Ginbot",
  "Sene",
  "Hamle",
  "Nehase",
  "Pagume",
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toJDN(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** Gregorian Date → Ethiopian {year, month(1-13), day}. Beyene–Kudlek algorithm. */
export function toEthiopian(date: Date): { year: number; month: number; day: number } {
  const jdn = toJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const era = 1723856; // Amete Mihret epoch
  const r = (jdn - era) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - era) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

export function ethiopianString(date: Date): string {
  const e = toEthiopian(date);
  return `${ETH_MONTHS[e.month - 1]} ${e.day}, ${e.year} E.C.`;
}

export function ymd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(s?: string | null): string {
  if (!s) return "—";
  const d = parseYmd(s.slice(0, 10));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** "Mon, Nov 3 · Hidar 24, 2018 E.C." — the dual-calendar convention shared with the student app. */
export function dualDate(date: Date): string {
  const g = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${g} · ${ethiopianString(date)}`;
}

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export function formatTime(t?: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

export function today(): string {
  return ymd(new Date());
}
