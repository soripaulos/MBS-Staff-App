import { createDoc, getDoc, getList, updateDoc } from "@/lib/api";
import { addDays, parseYmd, ymd } from "@/lib/dates";
import type { CourseScheduleRow, LessonPlanObjective, LessonPlanRow } from "@/lib/types";

/**
 * Moving what didn't get taught onto the next lesson.
 *
 * The bit teachers actually do by hand: you plan four objectives, get through
 * two, and the other two have to land somewhere. This finds where "somewhere"
 * is and puts them there, rather than leaving the teacher to retype them.
 *
 * Where they land, in order of preference:
 *  1. The next timetabled lesson for the same section and subject. If a plan
 *     already exists for it, the objectives are appended to it; otherwise a
 *     new plan is created on that date.
 *  2. If the timetable has nothing ahead — end of term, a gap, a section whose
 *     schedule hasn't been entered — the next school day (Mon–Fri) with no
 *     course schedule attached, which the teacher can move later.
 *
 * Objectives already carried are never carried twice: a plan that has been
 * carried records `carried_to`, and the caller is expected to check it.
 */

export interface CarryResult {
  target: string;
  targetDate: string;
  /** True when a new plan was created rather than an existing one extended. */
  created: boolean;
  /** True when the destination is a real timetabled lesson. */
  scheduled: boolean;
  moved: number;
}

export class NothingToCarry extends Error {
  constructor() {
    super("Every objective on this plan is marked achieved — there is nothing to carry forward.");
  }
}

const norm = (s: string) => s.trim().toLowerCase();

/** Objectives explicitly flagged, or failing that everything not achieved. */
export function objectivesToCarry(plan: LessonPlanRow): LessonPlanObjective[] {
  const rows = plan.objectives ?? [];
  const flagged = rows.filter((o) => o.carry_forward);
  if (flagged.length) return flagged;
  return rows.filter((o) => o.outcome !== "Achieved");
}

function nextSchoolDay(date: string): string {
  let d = addDays(parseYmd(date), 1);
  let guard = 0;
  while ((d.getDay() === 0 || d.getDay() === 6) && guard++ < 10) d = addDays(d, 1);
  return ymd(d);
}

export async function carryForward(plan: LessonPlanRow): Promise<CarryResult> {
  const carrying = objectivesToCarry(plan);
  if (!carrying.length) throw new NothingToCarry();

  const fresh: LessonPlanObjective[] = carrying.map((o) => ({
    objective: o.objective,
    outcome: "Not started",
    carry_forward: 0,
    notes: o.notes ?? null,
  }));

  // 1. The next timetabled lesson for this section and subject.
  const schedules = await getList<CourseScheduleRow>("Course Schedule", {
    filters: [
      ["student_group", "=", plan.student_group],
      ["course", "=", plan.course],
      ["schedule_date", ">", plan.plan_date],
      ...(plan.instructor ? [["instructor", "=", plan.instructor]] : []),
    ] as never,
    fields: ["name", "course", "student_group", "instructor", "schedule_date", "from_time", "to_time"],
    orderBy: "schedule_date asc, from_time asc",
    limit: 1,
  }).catch(() => [] as CourseScheduleRow[]);

  const next = schedules[0] ?? null;
  const targetDate = next?.schedule_date ?? nextSchoolDay(plan.plan_date);

  // 2. Does a plan already exist there? Prefer the one on the schedule; fall
  //    back to any plan for the same section, subject and date.
  const existing = await getList<LessonPlanRow>("Lesson Plan", {
    filters: [
      ["student_group", "=", plan.student_group],
      ["course", "=", plan.course],
      ["plan_date", "=", targetDate],
    ] as never,
    fields: ["name", "title", "plan_date", "course", "student_group", "course_schedule", "status"],
    limit: 5,
  }).catch(() => [] as LessonPlanRow[]);

  const match = next ? (existing.find((p) => p.course_schedule === next.name) ?? existing[0]) : existing[0];

  let target: string;
  let created: boolean;

  if (match) {
    // Append, skipping objectives already on the destination.
    const destination = await getDoc<LessonPlanRow>("Lesson Plan", match.name);
    const have = new Set((destination.objectives ?? []).map((o) => norm(o.objective)));
    const additions = fresh.filter((o) => !have.has(norm(o.objective)));
    await updateDoc("Lesson Plan", match.name, {
      objectives: [...(destination.objectives ?? []), ...additions],
      carried_from: plan.name,
    });
    target = match.name;
    created = false;
  } else {
    const doc = await createDoc<{ name: string }>("Lesson Plan", {
      title: `${plan.title} (continued)`,
      course: plan.course,
      student_group: plan.student_group,
      instructor: plan.instructor,
      plan_date: targetDate,
      ...(next ? { course_schedule: next.name } : {}),
      academic_year: plan.academic_year,
      status: "Planned",
      unit: plan.unit,
      topic: plan.topic,
      teaching_method: plan.teaching_method,
      materials: plan.materials,
      objectives: fresh,
      carried_from: plan.name,
    });
    target = doc.name;
    created = true;
  }

  // 3. Close the source off so it cannot be carried a second time.
  const achieved = (plan.objectives ?? []).filter((o) => o.outcome === "Achieved").length;
  await updateDoc("Lesson Plan", plan.name, {
    carried_to: target,
    status: achieved ? "Partially taught" : "Not taught",
  });

  return { target, targetDate, created, scheduled: !!next, moved: fresh.length };
}
