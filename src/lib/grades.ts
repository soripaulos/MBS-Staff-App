/** Official Makko Billi grading scale. Grades are always computed, never stored. */
export function letterGrade(pct: number): string {
  if (pct >= 95) return "A+";
  if (pct >= 90) return "A";
  if (pct >= 85) return "B+";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

/** Tailwind classes for a percentage band (used across marks grids and charts). */
export function bandClass(pct: number): string {
  if (pct >= 90) return "text-emerald-700 dark:text-emerald-400";
  if (pct >= 75) return "text-sky-700 dark:text-sky-400";
  if (pct >= 60) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

export function bandBg(pct: number): string {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 75) return "bg-sky-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}
