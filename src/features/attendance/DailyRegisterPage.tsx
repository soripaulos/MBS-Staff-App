import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, CalendarOff, Clock, Info, Stethoscope, FileText, Users } from "lucide-react";
import { createDoc, getDoc, getList, call, submitDoc } from "@/lib/api";
import { today, formatTime, dualDate, parseYmd } from "@/lib/dates";
import { PERMISSION_REASONS, SICK_ACTIONS, SICK_TYPES } from "@/lib/constants";
import { useSession } from "@/providers/SessionProvider";
import { useMyGroups } from "@/features/shared/useGroups";
import type { AttendanceRow, GroupStudent } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The daily register — the primary way attendance is taken.
 *
 * A homeroom teacher marks their whole section for the day in one pass. The
 * per-lesson register (`/attendance/take/:scheduleId`, reached from the
 * timetable) still exists for subject teachers who need period-by-period
 * attendance, but it is the exception rather than the route everyone uses.
 *
 * A day mark writes one `Student Attendance` with a `student_group` and no
 * `course_schedule`, which is how Frappe distinguishes day attendance from
 * lesson attendance. Late / Sick / Permission additionally write the matching
 * record, so the register and the student's history never drift apart.
 */

type Mark = "Present" | "Late" | "Absent" | "Leave";
type AbsenceKind = "unexcused" | "sick" | "permission";

interface Detail {
  lateTime?: string;
  lateReason?: string;
  absenceKind?: AbsenceKind;
  sickType?: string;
  sickDetails?: string;
  sickAction?: string;
  parentContacted?: boolean;
  leaveEarly?: boolean;
  permissionReason?: string;
  permissionDetail?: string;
}

const MARKS: { key: Mark; label: string; icon: typeof Check; on: string }[] = [
  { key: "Present", label: "Present", icon: Check, on: "border-emerald-600 bg-emerald-600" },
  { key: "Late", label: "Late", icon: Clock, on: "border-amber-500 bg-amber-500" },
  { key: "Absent", label: "Absent", icon: X, on: "border-red-600 bg-red-600" },
  { key: "Leave", label: "Leave", icon: CalendarOff, on: "border-sky-600 bg-sky-600" },
];

const toStatus = (m: Mark): AttendanceRow["status"] => (m === "Late" ? "Present" : m);

export default function DailyRegisterPage() {
  const session = useSession();
  const qc = useQueryClient();
  const { groups, loading: groupsLoading } = useMyGroups();
  const [params, setParams] = useSearchParams();

  const [date, setDate] = useState(params.get("date") ?? today());
  const group = params.get("group") ?? groups[0]?.name ?? null;
  const setGroup = (g: string) => setParams({ group: g, date }, { replace: true });

  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const canLog = group ? session.isHomeroomOf(group) || session.isLeadership : false;

  const q = useQuery({
    queryKey: ["daily-register", group, date],
    enabled: !!group && !!date,
    queryFn: async () => {
      const groupDoc = await getDoc<{ students?: GroupStudent[] }>("Student Group", group!);
      const students = (groupDoc.students ?? [])
        .filter((s) => s.active !== 0)
        .sort((a, b) => (a.group_roll_number ?? 999) - (b.group_roll_number ?? 999));
      const ids = students.map((s) => s.student);
      const safe = async <T,>(fn: () => Promise<T[]>) => fn().catch(() => [] as T[]);
      const none = Promise.resolve([] as never[]);

      const [existing, lates, sicks, permissions] = await Promise.all([
        safe(() =>
          getList<AttendanceRow>("Student Attendance", {
            filters: [["student_group", "=", group!], ["date", "=", date], ["docstatus", "!=", 2]],
            fields: ["name", "student", "status", "docstatus", "course_schedule"],
            limit: 400,
          }),
        ),
        ids.length
          ? safe(() =>
              getList<{ student: string; time?: string }>("Student Late Record", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "time"],
                limit: 400,
              }),
            )
          : none,
        ids.length
          ? safe(() =>
              getList<{ student: string; type?: string }>("Student Sick Record", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "type"],
                limit: 400,
              }),
            )
          : none,
        ids.length
          ? safe(() =>
              getList<{ student: string; reason?: string }>("Student Permission Leave", {
                filters: [["date", "=", date], ["student", "in", ids], ["docstatus", "!=", 2]],
                fields: ["student", "reason"],
                limit: 400,
              }),
            )
          : none,
      ]);
      return { students, existing, lates, sicks, permissions };
    },
  });

  // Seed from what already exists for this day. Day rows (no course_schedule)
  // win over lesson rows, since this screen is about the day as a whole.
  useEffect(() => {
    if (!q.data) return;
    const dayRows = new Map(
      q.data.existing.filter((e) => !e.course_schedule).map((e) => [e.student, e]),
    );
    const lateBy = new Map(q.data.lates.map((r) => [r.student, r]));
    const sickBy = new Map(q.data.sicks.map((r) => [r.student, r]));
    const permBy = new Map(q.data.permissions.map((r) => [r.student, r]));

    const m: Record<string, Mark> = {};
    const d: Record<string, Detail> = {};
    for (const s of q.data.students) {
      const sick = sickBy.get(s.student);
      const perm = permBy.get(s.student);
      const late = lateBy.get(s.student);
      const prior = dayRows.get(s.student);
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
    setDone(null);
  }, [q.data]);

  const dayRowMap = useMemo(
    () => new Map((q.data?.existing ?? []).filter((e) => !e.course_schedule).map((e) => [e.student, e])),
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
      const w = { register: 0, events: 0, skipped: 0 };
      for (const [student, mark] of Object.entries(marks)) {
        const prior = dayRowMap.get(student);
        const status = toStatus(mark);
        if (prior?.status === status) {
          // unchanged
        } else if (prior) {
          if (prior.docstatus === 1) {
            w.skipped++;
          } else {
            await call("frappe.client.set_value", {
              doctype: "Student Attendance",
              name: prior.name,
              fieldname: "status",
              value: status,
            });
            w.register++;
          }
        } else {
          const doc = await createDoc<Record<string, unknown>>("Student Attendance", {
            student,
            student_group: group,
            date,
            status,
          });
          await submitDoc(doc).catch(() => undefined);
          w.register++;
        }

        if (!canLog) continue;
        const d = details[student] ?? {};
        try {
          if (mark === "Late" && !alreadyLogged.has(`late:${student}`)) {
            const doc = await createDoc<Record<string, unknown>>("Student Late Record", {
              student,
              date,
              time: `${d.lateTime || new Date().toTimeString().slice(0, 5)}:00`,
              reason: d.lateReason || "",
            });
            await submitDoc(doc).catch(() => undefined);
            w.events++;
          } else if (mark === "Absent" && d.absenceKind === "sick" && !alreadyLogged.has(`sick:${student}`)) {
            const doc = await createDoc<Record<string, unknown>>("Student Sick Record", {
              student,
              date,
              type: d.sickType || SICK_TYPES[0],
              details: d.sickDetails || "",
              action: d.sickAction || SICK_ACTIONS[0],
              parent_contacted: d.parentContacted ? 1 : 0,
              leave_early: d.leaveEarly ? 1 : 0,
            });
            await submitDoc(doc).catch(() => undefined);
            w.events++;
          } else if (mark === "Absent" && d.absenceKind === "permission" && !alreadyLogged.has(`perm:${student}`)) {
            const doc = await createDoc<Record<string, unknown>>("Student Permission Leave", {
              student,
              date,
              time: `${new Date().toTimeString().slice(0, 5)}:00`,
              reason: d.permissionReason || PERMISSION_REASONS[0],
              detail: d.permissionDetail || "",
            });
            await submitDoc(doc).catch(() => undefined);
            w.events++;
          }
        } catch {
          w.skipped++;
        }
      }
      return w;
    },
    onSuccess: (w) => {
      setDone(
        `Saved — ${w.register} attendance record${w.register === 1 ? "" : "s"}` +
          (w.events ? `, ${w.events} linked record${w.events === 1 ? "" : "s"}` : "") +
          (w.skipped ? `. ${w.skipped} locked or not permitted.` : "."),
      );
      void qc.invalidateQueries({ queryKey: ["daily-register"] });
    },
  });

  const students = q.data?.students ?? [];
  const counts: Record<Mark, number> = { Present: 0, Late: 0, Absent: 0, Leave: 0 };
  for (const s of students) counts[marks[s.student] ?? "Present"]++;

  const openDetail = openStudent ? students.find((s) => s.student === openStudent) : null;
  const setDetail = (student: string, patch: Partial<Detail>) =>
    setDetails((prev) => ({ ...prev, [student]: { ...prev[student], ...patch } }));

  return (
    <div className="pb-28 md:pb-6">
      <PageTitle title="Daily register" subtitle={dualDate(parseYmd(date))} />

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Section</Label>
          <Select value={group ?? ""} onChange={(e) => setGroup(e.target.value)} aria-label="Section">
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.student_group_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setParams({ ...(group ? { group } : {}), date: e.target.value }, { replace: true });
            }}
          />
        </div>
      </div>

      {groupsLoading ? (
        <ListSkeleton rows={8} />
      ) : !group ? (
        <EmptyState title="No sections" hint="You are not assigned to any student group this year." icon={<Users size={40} />} />
      ) : q.isLoading ? (
        <ListSkeleton rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !students.length ? (
        <EmptyState title="No students" hint="This section has no active students." icon={<Users size={40} />} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
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

          {!canLog && (
            <Card className="mb-3 flex items-start gap-2 py-2.5">
              <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You can mark this register. Recording the reason behind a late arrival or absence is the homeroom
                teacher's job for this section.
              </p>
            </Card>
          )}

          <Card className="p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.map((s) => {
                const mark = marks[s.student] ?? "Present";
                const locked = dayRowMap.get(s.student)?.docstatus === 1;
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
                        : mark === "Absent" && d.absenceKind === "unexcused"
                          ? "unexcused"
                          : null;
                return (
                  <li key={s.student} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">
                        {s.group_roll_number ?? ""}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.student_name}</p>
                        {tag && <p className="truncate text-[11px] text-slate-500">{tag}</p>}
                        {locked && <p className="text-[10px] uppercase tracking-wide text-slate-400">saved</p>}
                      </div>
                      {canLog && (mark === "Late" || mark === "Absent") && (
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
                              if (opt.key === "Absent" && !details[s.student]?.absenceKind && canLog) {
                                setOpenStudent(s.student);
                              }
                            }}
                            className={cn(
                              "flex min-h-[44px] items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-40",
                              active ? `${opt.on} text-white` : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
                            )}
                          >
                            <Icon size={14} />
                            <span className="hidden sm:inline">{opt.label}</span>
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
            <Button className="w-full shadow-lg" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : `Save register (${students.length} students)`}
            </Button>
            {done && <p className="mt-2 text-center text-sm text-emerald-600">{done}</p>}
            {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
          </div>
        </>
      )}

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
                    value={details[openDetail.student]?.lateReason ?? ""}
                    onChange={(e) => setDetail(openDetail.student, { lateReason: e.target.value })}
                  />
                </div>
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
                    <div className="grid grid-cols-2 gap-3">
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
                        <Label>Action taken</Label>
                        <Select
                          value={details[openDetail.student]?.sickAction ?? SICK_ACTIONS[0]}
                          onChange={(e) => setDetail(openDetail.student, { sickAction: e.target.value })}
                        >
                          {SICK_ACTIONS.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Details</Label>
                      <Textarea
                        rows={2}
                        value={details[openDetail.student]?.sickDetails ?? ""}
                        onChange={(e) => setDetail(openDetail.student, { sickDetails: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!details[openDetail.student]?.parentContacted}
                          onChange={(e) => setDetail(openDetail.student, { parentContacted: e.target.checked })}
                        />
                        Parent contacted
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!details[openDetail.student]?.leaveEarly}
                          onChange={(e) => setDetail(openDetail.student, { leaveEarly: e.target.checked })}
                        />
                        Left school early
                      </label>
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
