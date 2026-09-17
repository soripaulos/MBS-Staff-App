import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarOff, Users } from "lucide-react";
import { getDoc, getList } from "@/lib/api";
import { addDays, formatDate, parseYmd, today, weekdayName, ymd } from "@/lib/dates";
import { useMyGroups } from "@/features/shared/useGroups";
import type { AttendanceRow, GroupStudent } from "@/lib/types";
import { Card, EmptyState, ErrorState, Input, Label, ListSkeleton, PageTitle, Select, Skeleton, Tabs } from "@/components/ui";
import { cn, downloadCsv, round1 } from "@/lib/utils";

/**
 * Attendance, leave, late and sick read together for one section.
 *
 * Entry screens answer "who is here today"; this answers the questions that
 * only show up over a term — who is slipping, what kind of absence dominates,
 * and which days never got a register at all. Everything here is derived from
 * the same records the daily register writes, so there is nothing extra to
 * maintain.
 *
 * Only submitted and draft rows count (docstatus != 2); cancelled ones are
 * corrections and would double-count.
 */

const GRID = "var(--viz-grid)";
const MUTED = "var(--viz-muted)";
const S1 = "var(--viz-series-1)";
const S2 = "var(--viz-series-2)";

const tooltipStyle = {
  backgroundColor: "rgb(15 23 42 / 0.92)",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
};

interface Tally {
  student: string;
  name: string;
  roll?: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  sick: number;
  permission: number;
  approvedLeave: number;
  marked: number;
}

function rate(t: Tally): number {
  return t.marked ? ((t.present + t.leave) / t.marked) * 100 : NaN;
}

/** A school week is Mon–Fri here; weekends are not expected to have a register. */
function schoolDaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let d = parseYmd(from);
  const end = parseYmd(to);
  let guard = 0;
  while (d <= end && guard++ < 400) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(ymd(d));
    d = addDays(d, 1);
  }
  return out;
}

export default function AttendanceInsightPage() {
  const { groups, loading: groupsLoading } = useMyGroups();
  const [params, setParams] = useSearchParams();
  const group = params.get("group") ?? groups[0]?.name ?? null;
  const [from, setFrom] = useState(() => ymd(addDays(new Date(), -60)));
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState("students");

  const setGroup = (g: string) => setParams({ group: g }, { replace: true });

  const q = useQuery({
    queryKey: ["attendance-insight", group, from, to],
    enabled: !!group,
    queryFn: async () => {
      const groupDoc = await getDoc<{ students?: GroupStudent[] }>("Student Group", group!);
      const students = (groupDoc.students ?? [])
        .filter((s) => s.active !== 0)
        .sort((a, b) => (a.group_roll_number ?? 999) - (b.group_roll_number ?? 999));
      const ids = students.map((s) => s.student);
      const safe = async <T,>(fn: () => Promise<T[]>) => fn().catch(() => [] as T[]);
      const none = Promise.resolve([] as never[]);
      const byDate = <T,>(doctype: string, fields: string[]) =>
        ids.length
          ? safe(() =>
              getList<T>(doctype, {
                filters: [["date", "between", [from, to]], ["student", "in", ids], ["docstatus", "!=", 2]] as never,
                fields: ["name", "student", "date", ...fields],
                limit: 2000,
              }),
            )
          : none;

      const [attendance, lates, sicks, permissions, applications] = await Promise.all([
        safe(() =>
          getList<AttendanceRow>("Student Attendance", {
            filters: [
              ["student_group", "=", group!],
              ["date", "between", [from, to]],
              ["docstatus", "!=", 2],
            ] as never,
            fields: ["name", "student", "date", "status", "docstatus", "course_schedule"],
            limit: 5000,
          }),
        ),
        byDate<{ student: string; date: string; reason?: string }>("Student Late Record", ["reason"]),
        byDate<{ student: string; date: string; type?: string }>("Student Sick Record", ["type"]),
        byDate<{ student: string; date: string; reason?: string }>("Student Permission Leave", ["reason"]),
        ids.length
          ? safe(() =>
              getList<{ name: string; student: string; from_date: string; to_date: string; total_leave_days?: number; custom_status?: string }>(
                "Student Leave Application",
                {
                  filters: [["student", "in", ids], ["to_date", ">=", from], ["from_date", "<=", to]] as never,
                  fields: ["name", "student", "from_date", "to_date", "total_leave_days", "custom_status"],
                  limit: 500,
                },
              ),
            )
          : none,
      ]);
      return { students, attendance, lates, sicks, permissions, applications };
    },
  });

  const model = useMemo(() => {
    if (!q.data) return null;
    const { students, attendance, lates, sicks, permissions, applications } = q.data;
    // Day rows only — lesson rows would count the same day several times.
    const dayRows = attendance.filter((a) => !a.course_schedule);

    const lateKeys = new Set(lates.map((r) => `${r.student}|${r.date}`));
    const sickKeys = new Set(sicks.map((r) => `${r.student}|${r.date}`));
    const permKeys = new Set(permissions.map((r) => `${r.student}|${r.date}`));

    const tallies = new Map<string, Tally>();
    for (const s of students) {
      tallies.set(s.student, {
        student: s.student,
        name: s.student_name,
        roll: s.group_roll_number,
        present: 0,
        late: 0,
        absent: 0,
        leave: 0,
        sick: 0,
        permission: 0,
        approvedLeave: 0,
        marked: 0,
      });
    }
    for (const a of applications) {
      const t = tallies.get(a.student);
      if (t && a.custom_status === "Approved") t.approvedLeave += a.total_leave_days ?? 1;
    }

    const perDay = new Map<string, { date: string; present: number; marked: number; absent: number; late: number }>();
    for (const r of dayRows) {
      const t = tallies.get(r.student);
      if (!t) continue;
      const key = `${r.student}|${r.date}`;
      t.marked++;
      if (r.status === "Leave") t.leave++;
      else if (r.status === "Absent") t.absent++;
      else t.present++;
      if (lateKeys.has(key)) t.late++;
      if (sickKeys.has(key)) t.sick++;
      if (permKeys.has(key)) t.permission++;

      const d = perDay.get(r.date) ?? { date: r.date, present: 0, marked: 0, absent: 0, late: 0 };
      d.marked++;
      if (r.status === "Absent") d.absent++;
      else d.present++;
      if (lateKeys.has(key)) d.late++;
      perDay.set(r.date, d);
    }

    const rows = [...tallies.values()].filter((t) => t.marked > 0 || t.approvedLeave > 0);
    const totals = rows.reduce(
      (a, t) => ({
        marked: a.marked + t.marked,
        present: a.present + t.present,
        absent: a.absent + t.absent,
        leave: a.leave + t.leave,
        late: a.late + t.late,
        sick: a.sick + t.sick,
        permission: a.permission + t.permission,
      }),
      { marked: 0, present: 0, absent: 0, leave: 0, late: 0, sick: 0, permission: 0 },
    );

    const series = [...perDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        label: formatDate(d.date).replace(/,.*/, ""),
        rate: d.marked ? round1((d.present / d.marked) * 100) : 0,
        absent: d.absent,
        late: d.late,
      }));

    const registered = new Set(series.map((s) => s.date));
    const missing = schoolDaysBetween(from, to).filter((d) => !registered.has(d) && d <= today());

    // Unexplained absence is what is left once sick, permission and approved
    // leave are accounted for — the number worth chasing.
    const explained = totals.sick + totals.permission + totals.leave;
    const unexplained = Math.max(0, totals.absent + totals.leave - explained);
    const reasons = [
      { name: "Sick", value: totals.sick },
      { name: "Permission", value: totals.permission },
      { name: "Approved leave", value: totals.leave },
      { name: "Unexplained", value: unexplained },
    ].filter((r) => r.value > 0);

    return { rows, totals, series, missing, reasons };
  }, [q.data, from, to]);

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(`${group} attendance ${from} to ${to}.csv`, [
      ["Student", "Days marked", "Present", "Absent", "Leave", "Late", "Sick", "Permission", "Attendance %"],
      ...model.rows.map((t) => [
        t.name,
        t.marked,
        t.present,
        t.absent,
        t.leave,
        t.late,
        t.sick,
        t.permission,
        Number.isNaN(rate(t)) ? "" : round1(rate(t)),
      ]),
    ]);
  };

  return (
    <div>
      <PageTitle title="Attendance insight" subtitle="Attendance, late arrivals, sickness and leave, read together" />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
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
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {groupsLoading ? (
        <ListSkeleton rows={6} />
      ) : !group ? (
        <EmptyState title="No sections" hint="You are not assigned to any student group this year." icon={<Users size={40} />} />
      ) : q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !model || !model.rows.length ? (
        <EmptyState
          title="Nothing recorded yet"
          hint="Once registers are taken for this section in the chosen range, the summary appears here."
          icon={<CalendarOff size={40} />}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Attendance rate"
              value={model.totals.marked ? `${round1((model.totals.present / model.totals.marked) * 100)}%` : "—"}
              hint={`${model.totals.marked} student-days marked`}
            />
            <Stat label="Absences" value={model.totals.absent} hint={`${model.totals.leave} on leave`} />
            <Stat label="Late arrivals" value={model.totals.late} hint={`${model.series.length} days registered`} />
            <Stat label="Sick days" value={model.totals.sick} hint={`${model.totals.permission} permission leaves`} />
          </div>

          {model.missing.length > 0 && (
            <Card className="flex items-start gap-2 border-amber-300 bg-amber-50 py-2.5 dark:border-amber-800 dark:bg-amber-950/40">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="min-w-0 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold">
                  {model.missing.length} school day{model.missing.length === 1 ? "" : "s"} with no register
                </p>
                <p className="truncate">
                  {model.missing
                    .slice(-6)
                    .map((d) => `${weekdayName(parseYmd(d)).slice(0, 3)} ${formatDate(d).replace(/,.*/, "")}`)
                    .join(" · ")}
                  {model.missing.length > 6 ? " …" : ""}
                </p>
              </div>
            </Card>
          )}

          <div className="mb-1">
            <Tabs
              tabs={[
                { key: "students", label: "By student" },
                { key: "trend", label: "Day by day" },
                { key: "reasons", label: "Why absent" },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          {tab === "trend" && (
            <Card>
              <h2 className="font-semibold">Attendance rate by day</h2>
              <p className="mb-2 text-xs text-slate-400">Share of the section present each day a register was taken.</p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={model.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Present"]} />
                  <Line type="monotone" dataKey="rate" stroke={S1} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {tab === "reasons" && (
            <Card>
              <h2 className="font-semibold">What is behind the absences</h2>
              <p className="mb-2 text-xs text-slate-400">
                Sick, permission and approved leave come from their own records. Anything left over is unexplained.
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={model.reasons} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={S2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {tab === "students" && (
            <Card className="p-0">
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-semibold">{model.rows.length} students · lowest attendance first</p>
                <button onClick={exportCsv} className="text-xs font-medium text-brand-600 dark:text-brand-300">
                  Export CSV
                </button>
              </div>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[620px] border-t border-slate-200 text-sm dark:border-slate-800">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 dark:bg-slate-800/95">Student</th>
                      <th className="px-2 py-2 text-right">Days</th>
                      <th className="px-2 py-2 text-right">Absent</th>
                      <th className="px-2 py-2 text-right">Late</th>
                      <th className="px-2 py-2 text-right">Sick</th>
                      <th className="px-2 py-2 text-right">Perm.</th>
                      <th className="px-2 py-2 text-right">Leave</th>
                      <th className="px-3 py-2 text-right">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...model.rows]
                      .sort((a, b) => (rate(a) || 0) - (rate(b) || 0))
                      .map((t) => {
                        const r = rate(t);
                        return (
                          <tr key={t.student} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="sticky left-0 z-10 max-w-52 truncate bg-white px-4 py-2 font-medium dark:bg-slate-900">
                              <Link to={`/students/${encodeURIComponent(t.student)}`} className="hover:text-brand-600">
                                {t.name}
                              </Link>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">{t.marked}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.absent || ""}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.late || ""}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.sick || ""}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.permission || ""}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{t.leave || ""}</td>
                            <td className="px-3 py-2 text-right">
                              {Number.isNaN(r) ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                <span
                                  className={cn(
                                    "font-semibold tabular-nums",
                                    r < 80 ? "text-red-600" : r < 90 ? "text-amber-600" : "text-emerald-600",
                                  )}
                                >
                                  {round1(r)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <p className="text-xl font-bold leading-tight">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}
