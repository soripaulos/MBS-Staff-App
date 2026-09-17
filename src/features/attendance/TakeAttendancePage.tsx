import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, X, CalendarOff, Clock, Info, Stethoscope, FileText } from "lucide-react";
import { call, createDoc, getDoc, getList, postCall, submitDoc } from "@/lib/api";
import { formatTime, formatDate } from "@/lib/dates";
import { PERMISSION_REASONS, SICK_TYPES } from "@/lib/constants";
import { useSession } from "@/providers/SessionProvider";
import type { AttendanceRow, CourseScheduleRow, GroupStudent } from "@/lib/types";
import { Badge, Button, Card, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * One register per Course Schedule session.
 *
 * The four marks a teacher actually uses are Present / Late / Absent / Leave,
 * but `Student Attendance.status` only has Present, Absent and Leave — so Late
 * is recorded as Present in the register plus a `Student Late Day` record.
 * Absences can likewise be tagged Sick or Permission, which writes the matching
 * `Student Sick Day` / `Student Permission Leave`.
 *
 * Creating those three doctypes is the homeroom teacher's job (enforced
 * server-side by Before Save guards), so subject teachers see a plain
 * Present/Absent/Leave register with no reason capture.
 */

type Mark = "Present" | "Late" | "Absent" | "Leave";
type AbsenceKind = "unexcused" | "sick" | "permission";

interface Detail {
  lateTime?: string;
  absenceKind?: AbsenceKind;
  sickType?: string;
  sickDetails?: string;
  permissionReason?: string;
  permissionDetail?: string;
}

const MARKS: { key: Mark; label: string; icon: typeof Check; cls: string }[] = [
  { key: "Present", label: "Present", icon: Check, cls: "border-emerald-600 bg-emerald-600" },
  { key: "Late", label: "Late", icon: Clock, cls: "border-amber-500 bg-amber-500" },
  { key: "Absent", label: "Absent", icon: X, cls: "border-red-600 bg-red-600" },
  { key: "Leave", label: "Leave", icon: CalendarOff, cls: "border-sky-600 bg-sky-600" },
];

/** Register status that a mark maps to. Late still counts as in attendance. */
const toStatus = (m: Mark): AttendanceRow["status"] => (m === "Late" ? "Present" : m);

export default function TakeAttendancePage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const session = useSession();
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["take-attendance", scheduleId],
    enabled: !!scheduleId,
    queryFn: async () => {
      const schedule = await getDoc<CourseScheduleRow>("Course Schedule", scheduleId!);
      const groupDoc = await getDoc<{ students?: GroupStudent[] }>("Student Group", schedule.student_group);
      const students = (groupDoc.students ?? [])
        .filter((s) => s.active !== 0)
        .sort((a, b) => (a.group_roll_number ?? 999) - (b.group_roll_number ?? 999));
      const ids = students.map((s) => s.student);
      const date = schedule.schedule_date;

      const safe = async <T,>(fn: () => Promise<T[]>) => fn().catch(() => [] as T[]);
      const [existing, lates, sicks, permissions] = await Promise.all([
        safe(() =>
          getList<AttendanceRow>("Student Attendance", {
            filters: [["course_schedule", "=", schedule.name], ["docstatus", "!=", 2]],
            fields: ["name", "student", "status", "docstatus"],
            limit: 300,
          }),
        ),
        ids.length
          ? safe(() =>
              getList<{ student: string; time?: string }>("Student Late Day", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "time"],
                limit: 300,
              }),
            )
          : Promise.resolve([]),
        ids.length
          ? safe(() =>
              getList<{ student: string; type?: string }>("Student Sick Day", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "type"],
                limit: 300,
              }),
            )
          : Promise.resolve([]),
        ids.length
          ? safe(() =>
              getList<{ student: string; reason?: string }>("Student Permission Leave", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "reason"],
                limit: 300,
              }),
            )
          : Promise.resolve([]),
      ]);
      return { schedule, students, existing, lates, sicks, permissions };
    },
  });

  const canLogEvents = q.data ? session.isHomeroomOf(q.data.schedule.student_group) || session.isLeadership : false;

  // Seed from whatever is already recorded for this session and date, so a
  // sick day logged at the school gate this morning shows up here.
  useEffect(() => {
    if (!q.data) return;
    const attendance = new Map(q.data.existing.map((e) => [e.student, e]));
    const lateBy = new Map(q.data.lates.map((r) => [r.student, r]));
    const sickBy = new Map(q.data.sicks.map((r) => [r.student, r]));
    const permBy = new Map(q.data.permissions.map((r) => [r.student, r]));

    const m: Record<string, Mark> = {};
    const d: Record<string, Detail> = {};
    for (const s of q.data.students) {
      const prior = attendance.get(s.student);
      const sick = sickBy.get(s.student);
      const perm = permBy.get(s.student);
      const late = lateBy.get(s.student);

      if (sick) {
        m[s.student] = "Absent";
        d[s.student] = { absenceKind: "sick", sickType: sick.type ?? SICK_TYPES[0] };
      } else if (perm) {
        m[s.student] = "Absent";
        d[s.student] = { absenceKind: "permission", permissionReason: perm.reason ?? PERMISSION_REASONS[0] };
      } else if (late) {
        m[s.student] = "Late";
        d[s.student] = { lateTime: (late.time ?? "").slice(0, 5) || undefined };
      } else if (prior) {
        m[s.student] = prior.status as Mark;
      } else {
        m[s.student] = "Present";
      }
    }
    setMarks(m);
    setDetails(d);
  }, [q.data]);

  const existingMap = useMemo(
    () => new Map((q.data?.existing ?? []).map((e) => [e.student, e])),
    [q.data],
  );
  const alreadyLogged = useMemo(() => {
    const s = new Set<string>();
    for (const r of q.data?.lates ?? []) s.add(`late:${r.student}`);
    for (const r of q.data?.sicks ?? []) s.add(`sick:${r.student}`);
    for (const r of q.data?.permissions ?? []) s.add(`perm:${r.student}`);
    return s;
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { schedule } = q.data!;
      const written = { register: 0, events: 0, skipped: 0 };

      // 1. The register itself.
      const changed = Object.entries(marks).filter(
        ([student, mark]) => existingMap.get(student)?.status !== toStatus(mark),
      );
      const fresh = changed.filter(([student]) => !existingMap.has(student));
      const updates = changed.filter(([student]) => existingMap.has(student));

      // The Education bulk endpoint only understands present/absent, so it is
      // only safe when nothing in this batch is marked Leave — otherwise those
      // students would be silently recorded Absent.
      const anyLeave = fresh.some(([, mark]) => toStatus(mark) === "Leave");
      let bulkDone = false;
      if (fresh.length && !updates.length && !anyLeave) {
        const present = fresh.filter(([, m]) => toStatus(m) === "Present").map(([s]) => ({ student: s }));
        const absent = fresh.filter(([, m]) => toStatus(m) === "Absent").map(([s]) => ({ student: s }));
        for (const method of ["education.education.api.mark_attendance", "erpnext.education.api.mark_attendance"]) {
          try {
            await postCall(method, {
              students_present: JSON.stringify(present),
              students_absent: JSON.stringify(absent),
              course_schedule: schedule.name,
              student_group: schedule.student_group,
              date: schedule.schedule_date,
            });
            written.register = fresh.length;
            bulkDone = true;
            break;
          } catch (e) {
            const status = (e as { status?: number }).status;
            if (status && status !== 404 && status !== 417) throw e;
          }
        }
      }

      if (!bulkDone) {
        for (const [student, mark] of changed) {
          const prior = existingMap.get(student);
          if (prior?.docstatus === 1) {
            // Submitted registers are corrected by cancel+amend on the desk.
            written.skipped++;
            continue;
          }
          if (prior) {
            await call("frappe.client.set_value", {
              doctype: "Student Attendance",
              name: prior.name,
              fieldname: "status",
              value: toStatus(mark),
            });
          } else {
            const doc = await createDoc<Record<string, unknown>>("Student Attendance", {
              student,
              student_group: schedule.student_group,
              course_schedule: schedule.name,
              date: schedule.schedule_date,
              status: toStatus(mark),
            });
            await submitDoc(doc).catch(() => undefined);
          }
          written.register++;
        }
      }

      // 2. The linked attendance events, for homeroom teachers only.
      if (canLogEvents) {
        for (const [student, mark] of Object.entries(marks)) {
          const d = details[student] ?? {};
          const date = schedule.schedule_date;
          try {
            if (mark === "Late" && !alreadyLogged.has(`late:${student}`)) {
              const doc = await createDoc<Record<string, unknown>>("Student Late Day", {
                student,
                date,
                time: `${d.lateTime || new Date().toTimeString().slice(0, 5)}:00`,
                reason: d.sickDetails || "",
              });
              await submitDoc(doc).catch(() => undefined);
              written.events++;
            } else if (mark === "Absent" && d.absenceKind === "sick" && !alreadyLogged.has(`sick:${student}`)) {
              const doc = await createDoc<Record<string, unknown>>("Student Sick Day", {
                student,
                date,
                type: d.sickType || SICK_TYPES[0],
                details: d.sickDetails || "",
              });
              await submitDoc(doc).catch(() => undefined);
              written.events++;
            } else if (mark === "Absent" && d.absenceKind === "permission" && !alreadyLogged.has(`perm:${student}`)) {
              const doc = await createDoc<Record<string, unknown>>("Student Permission Leave", {
                student,
                date,
                time: `${new Date().toTimeString().slice(0, 5)}:00`,
                reason: d.permissionReason || PERMISSION_REASONS[0],
                detail: d.permissionDetail || "",
              });
              await submitDoc(doc).catch(() => undefined);
              written.events++;
            }
          } catch {
            // A rejected event (e.g. the homeroom guard) must not lose the register.
            written.skipped++;
          }
        }
      }
      return written;
    },
    onSuccess: (w) => {
      setDone(
        `Register saved — ${w.register} attendance record${w.register === 1 ? "" : "s"}` +
          (w.events ? `, ${w.events} linked record${w.events === 1 ? "" : "s"}` : "") +
          (w.skipped ? `. ${w.skipped} already locked or not permitted.` : "."),
      );
      void qc.invalidateQueries({ queryKey: ["take-attendance", scheduleId] });
    },
  });

  if (q.isLoading) return <ListSkeleton rows={8} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { schedule, students } = q.data!;

  const counts: Record<Mark, number> = { Present: 0, Late: 0, Absent: 0, Leave: 0 };
  for (const s of students) counts[marks[s.student] ?? "Present"]++;

  const openDetail = openStudent ? students.find((s) => s.student === openStudent) : null;
  const setDetail = (student: string, patch: Partial<Detail>) =>
    setDetails((prev) => ({ ...prev, [student]: { ...prev[student], ...patch } }));

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-4">
      <Link to="/timetable" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300">
        <ArrowLeft size={16} /> Timetable
      </Link>
      <PageTitle
        title={`${schedule.course} — ${schedule.student_group}`}
        subtitle={`${formatDate(schedule.schedule_date)} · ${formatTime(schedule.from_time)}–${formatTime(schedule.to_time)}${schedule.room ? ` · ${schedule.room}` : ""}`}
      />

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm">
        <Badge tone="green">{counts.Present} present</Badge>
        {counts.Late > 0 && <Badge tone="amber">{counts.Late} late</Badge>}
        {counts.Absent > 0 && <Badge tone="red">{counts.Absent} absent</Badge>}
        {counts.Leave > 0 && <Badge tone="blue">{counts.Leave} leave</Badge>}
        <button
          className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40"
          onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.student, "Present" as Mark])))}
        >
          All present
        </button>
      </div>

      {!canLogEvents && (
        <Card className="mb-3 flex items-start gap-2 border-slate-200 bg-slate-50 py-2.5 dark:bg-slate-800/50">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            You can mark the register. Recording late arrivals, sick days and permission leaves is the homeroom
            teacher's job for this section.
          </p>
        </Card>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((s) => {
            const mark = marks[s.student] ?? "Present";
            const locked = existingMap.get(s.student)?.docstatus === 1;
            const d = details[s.student] ?? {};
            const tag =
              mark === "Late"
                ? d.lateTime
                  ? `arrived ${formatTime(`${d.lateTime}:00`)}`
                  : "late"
                : mark === "Absent" && d.absenceKind === "sick"
                  ? `sick — ${d.sickType ?? ""}`
                  : mark === "Absent" && d.absenceKind === "permission"
                    ? `permission — ${d.permissionReason ?? ""}`
                    : null;
            return (
              <li key={s.student} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">{s.group_roll_number ?? ""}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.student_name}</p>
                    {tag && <p className="truncate text-[11px] text-slate-500">{tag}</p>}
                    {locked && <p className="text-[10px] uppercase tracking-wide text-slate-400">saved</p>}
                  </div>
                  {canLogEvents && (mark === "Late" || mark === "Absent") && (
                    <button
                      onClick={() => setOpenStudent(s.student)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      Reason
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1" role="radiogroup" aria-label={`Attendance for ${s.student_name}`}>
                  {MARKS.map((opt) => {
                    const Icon = opt.icon;
                    const active = mark === opt.key;
                    return (
                      <button
                        key={opt.key}
                        role="radio"
                        aria-checked={active}
                        disabled={locked}
                        onClick={() => {
                          setMarks((m) => ({ ...m, [s.student]: opt.key }));
                          if (opt.key === "Late" && !details[s.student]?.lateTime) {
                            setDetail(s.student, { lateTime: new Date().toTimeString().slice(0, 5) });
                          }
                          if (opt.key === "Absent" && !details[s.student]?.absenceKind && canLogEvents) {
                            setOpenStudent(s.student);
                          }
                        }}
                        className={cn(
                          "flex min-h-[44px] items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40",
                          active
                            ? `${opt.cls} text-white`
                            : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
                        )}
                      >
                        <Icon size={14} />
                        <span className="hidden xs:inline sm:inline">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:static md:mt-4 md:px-0">
        <Button className="w-full shadow-lg" disabled={save.isPending || !students.length} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save register"}
        </Button>
        {done && <p className="mt-2 text-center text-sm text-emerald-600">{done}</p>}
        {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
      </div>

      {/* reason sheet */}
      <Modal open={!!openDetail} onClose={() => setOpenStudent(null)} title={openDetail?.student_name ?? ""}>
        {openDetail && (
          <div className="space-y-3">
            {marks[openDetail.student] === "Late" ? (
              <>
                <div>
                  <Label>Arrival time</Label>
                  <Input
                    type="time"
                    value={details[openDetail.student]?.lateTime ?? ""}
                    onChange={(e) => setDetail(openDetail.student, { lateTime: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Reason (optional)</Label>
                  <Textarea
                    rows={2}
                    value={details[openDetail.student]?.sickDetails ?? ""}
                    onChange={(e) => setDetail(openDetail.student, { sickDetails: e.target.value })}
                  />
                </div>
                <p className="text-xs text-slate-400">Saves a Late Day record alongside the register.</p>
              </>
            ) : (
              <>
                <div>
                  <Label>Why is this student absent?</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["unexcused", "Unexcused", FileText],
                      ["sick", "Sick", Stethoscope],
                      ["permission", "Permission", CalendarOff],
                    ] as const).map(([kind, label, Icon]) => (
                      <button
                        key={kind}
                        onClick={() => setDetail(openDetail.student, { absenceKind: kind })}
                        className={cn(
                          "flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium",
                          details[openDetail.student]?.absenceKind === kind
                            ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                            : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300",
                        )}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {details[openDetail.student]?.absenceKind === "sick" && (
                  <>
                    <div>
                      <Label>Type</Label>
                      <Select
                        value={details[openDetail.student]?.sickType ?? SICK_TYPES[0]}
                        onChange={(e) => setDetail(openDetail.student, { sickType: e.target.value })}
                      >
                        {SICK_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Details</Label>
                      <Textarea
                        rows={2}
                        value={details[openDetail.student]?.sickDetails ?? ""}
                        onChange={(e) => setDetail(openDetail.student, { sickDetails: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {details[openDetail.student]?.absenceKind === "permission" && (
                  <>
                    <div>
                      <Label>Reason</Label>
                      <Select
                        value={details[openDetail.student]?.permissionReason ?? PERMISSION_REASONS[0]}
                        onChange={(e) => setDetail(openDetail.student, { permissionReason: e.target.value })}
                      >
                        {PERMISSION_REASONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Detail</Label>
                      <Textarea
                        rows={2}
                        value={details[openDetail.student]?.permissionDetail ?? ""}
                        onChange={(e) => setDetail(openDetail.student, { permissionDetail: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <p className="text-xs text-slate-400">
                  Sick and permission absences also create the matching record, so the student's history and the
                  register stay in step. Unexcused marks the register only.
                </p>
              </>
            )}
            <Button className="w-full" onClick={() => setOpenStudent(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
