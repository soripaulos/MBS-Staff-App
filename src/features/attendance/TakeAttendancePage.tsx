import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X, CalendarOff } from "lucide-react";
import { call, createDoc, getDoc, getList, postCall, submitDoc } from "@/lib/api";
import { formatTime, formatDate } from "@/lib/dates";
import type { AttendanceRow, CourseScheduleRow, GroupStudent } from "@/lib/types";
import { Badge, Button, Card, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";
import { cn } from "@/lib/utils";

type Status = "Present" | "Absent" | "Leave";

/**
 * Mark attendance for one Course Schedule session.
 * Tries the Education app's bulk endpoint first; falls back to per-student insert+submit.
 */
async function saveAttendance(args: {
  schedule: CourseScheduleRow;
  marks: Record<string, Status>;
  existing: Map<string, AttendanceRow>;
}): Promise<{ saved: number }> {
  const { schedule, marks, existing } = args;
  const toWrite = Object.entries(marks).filter(([student, status]) => existing.get(student)?.status !== status);
  const fresh = toWrite.filter(([student]) => !existing.has(student));
  const changed = toWrite.filter(([student]) => existing.has(student));

  // Bulk path (only valid when nothing exists yet for this session).
  if (fresh.length && !changed.length) {
    const present = fresh.filter(([, s]) => s === "Present").map(([st]) => ({ student: st }));
    const absent = fresh.filter(([, s]) => s !== "Present").map(([st]) => ({ student: st }));
    for (const method of ["education.education.api.mark_attendance", "erpnext.education.api.mark_attendance"]) {
      try {
        await postCall(method, {
          students_present: JSON.stringify(present),
          students_absent: JSON.stringify(absent),
          course_schedule: schedule.name,
          student_group: schedule.student_group,
          date: schedule.schedule_date,
        });
        return { saved: fresh.length };
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status && status !== 404 && status !== 417) throw e;
      }
    }
  }

  // Fallback: one doc per student.
  let saved = 0;
  for (const [student, status] of toWrite) {
    const prior = existing.get(student);
    if (prior) {
      if (prior.docstatus === 1) {
        // Submitted docs can't be edited from here; cancel+amend is a desk flow.
        continue;
      }
      await call("frappe.client.set_value", { doctype: "Student Attendance", name: prior.name, fieldname: "status", value: status });
      saved++;
      continue;
    }
    const doc = await createDoc<Record<string, unknown>>("Student Attendance", {
      student,
      student_group: schedule.student_group,
      course_schedule: schedule.name,
      date: schedule.schedule_date,
      status,
    });
    try {
      await submitDoc(doc);
    } catch {
      /* stays as draft — still counted */
    }
    saved++;
  }
  return { saved };
}

export default function TakeAttendancePage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [done, setDone] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["take-attendance", scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const schedule = await getDoc<CourseScheduleRow>("Course Schedule", scheduleId!);
      const groupDoc = await getDoc<{ students?: GroupStudent[] }>("Student Group", schedule.student_group);
      const students = (groupDoc.students ?? []).filter((s) => s.active !== 0).sort((a, b) => (a.group_roll_number ?? 999) - (b.group_roll_number ?? 999));
      const existing = await getList<AttendanceRow>("Student Attendance", {
        filters: [["course_schedule", "=", schedule.name], ["docstatus", "!=", 2]],
        fields: ["name", "student", "status", "docstatus"],
        limit: 200,
      }).catch(() => [] as AttendanceRow[]);
      return { schedule, students, existing };
    },
  });

  useEffect(() => {
    if (!q.data) return;
    const initial: Record<string, Status> = {};
    const existingMap = new Map(q.data.existing.map((e) => [e.student, e]));
    for (const s of q.data.students) {
      initial[s.student] = (existingMap.get(s.student)?.status as Status) ?? "Present";
    }
    setMarks(initial);
  }, [q.data]);

  const existingMap = useMemo(() => new Map((q.data?.existing ?? []).map((e) => [e.student, e])), [q.data]);

  const save = useMutation({
    mutationFn: () => saveAttendance({ schedule: q.data!.schedule, marks, existing: existingMap }),
    onSuccess: (r) => {
      setDone(`Attendance saved (${r.saved} record${r.saved === 1 ? "" : "s"} written).`);
      void qc.invalidateQueries({ queryKey: ["take-attendance", scheduleId] });
    },
  });

  if (q.isLoading) return <ListSkeleton rows={8} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { schedule, students } = q.data!;

  const counts = { Present: 0, Absent: 0, Leave: 0 } as Record<Status, number>;
  for (const s of students) counts[marks[s.student] ?? "Present"]++;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/timetable" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300">
        <ArrowLeft size={16} /> Timetable
      </Link>
      <PageTitle
        title={`${schedule.course} — ${schedule.student_group}`}
        subtitle={`${formatDate(schedule.schedule_date)} · ${formatTime(schedule.from_time)}–${formatTime(schedule.to_time)}${schedule.room ? ` · ${schedule.room}` : ""}`}
      />

      <div className="mb-3 flex items-center gap-2 text-sm">
        <Badge tone="green">{counts.Present} present</Badge>
        <Badge tone="red">{counts.Absent} absent</Badge>
        <Badge tone="blue">{counts.Leave} leave</Badge>
        <button
          className="ml-auto text-xs font-medium text-brand-600 dark:text-brand-300"
          onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.student, "Present" as Status])))}
        >
          Mark all present
        </button>
      </div>

      <Card className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((s) => {
            const st = marks[s.student] ?? "Present";
            const submitted = existingMap.get(s.student)?.docstatus === 1;
            return (
              <li key={s.student} className="flex items-center gap-2 px-3 py-2">
                <span className="w-7 text-xs tabular-nums text-slate-400">{s.group_roll_number ?? ""}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.student_name}</span>
                {submitted && <span className="text-[10px] uppercase text-slate-400">saved</span>}
                <div className="flex gap-1" role="radiogroup" aria-label={`Status for ${s.student_name}`}>
                  {(["Present", "Absent", "Leave"] as Status[]).map((opt) => (
                    <button
                      key={opt}
                      role="radio"
                      aria-checked={st === opt}
                      disabled={submitted}
                      onClick={() => setMarks((m) => ({ ...m, [s.student]: opt }))}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition-colors disabled:opacity-40",
                        st === opt
                          ? opt === "Present"
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : opt === "Absent"
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-sky-600 bg-sky-600 text-white"
                          : "border-slate-300 text-slate-500 dark:border-slate-700",
                      )}
                    >
                      {opt === "Present" ? <Check size={16} /> : opt === "Absent" ? <X size={16} /> : <CalendarOff size={14} />}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="sticky bottom-20 mt-4 md:bottom-4">
        <Button className="w-full shadow-lg" disabled={save.isPending || !students.length} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save attendance"}
        </Button>
        {done && <p className="mt-2 text-center text-sm text-emerald-600">{done}</p>}
        {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
      </div>
    </div>
  );
}
