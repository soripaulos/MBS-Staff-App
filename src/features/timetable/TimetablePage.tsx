import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";
import { getChildList, getList } from "@/lib/api";
import { addDays, dualDate, formatTime, parseYmd, today, weekStart, ymd } from "@/lib/dates";
import type { CourseScheduleRow } from "@/lib/types";
import { useMyGroups } from "@/features/shared/useGroups";
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageTitle, Select, Tabs } from "@/components/ui";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const COLOR_MAP: Record<string, string> = {
  blue: "border-l-sky-500",
  green: "border-l-emerald-500",
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-amber-400",
  teal: "border-l-teal-500",
  violet: "border-l-violet-500",
  cyan: "border-l-cyan-500",
  amber: "border-l-amber-500",
  pink: "border-l-pink-500",
  purple: "border-l-purple-500",
};

function useWeekSchedule(mode: "mine" | "section", group: string | null, start: Date) {
  const session = useSession();
  const end = addDays(start, 6);
  const filters: (string | string[] | (string | string[])[])[][] = [
    ["schedule_date", "between", [ymd(start), ymd(end)]] as unknown as (string | string[])[],
  ];
  if (mode === "mine" && session.instructor) filters.push(["instructor", "=", session.instructor.name]);
  if (mode === "section" && group) filters.push(["student_group", "=", group]);

  return useQuery({
    queryKey: ["week-schedule", mode, group, session.instructor?.name, ymd(start)],
    enabled: mode === "mine" ? !!session.instructor : !!group,
    queryFn: () =>
      getList<CourseScheduleRow>("Course Schedule", {
        filters: filters as never,
        fields: [
          "name",
          "course",
          "student_group",
          "instructor_name",
          "room",
          "schedule_date",
          "from_time",
          "to_time",
          "class_schedule_color",
        ],
        orderBy: "schedule_date asc, from_time asc",
        limit: 500,
      }),
  });
}

function useHolidays(start: Date) {
  const end = addDays(start, 6);
  return useQuery({
    queryKey: ["holidays", ymd(start)],
    staleTime: 60 * 60 * 1000,
    queryFn: () =>
      getChildList<{ holiday_date: string; description?: string }>("Holiday", "Holiday List", {
        filters: { holiday_date: ["between", [ymd(start), ymd(end)]], weekly_off: 0 } as never,
        fields: ["holiday_date", "description"],
        limit: 20,
      }).catch(() => []),
  });
}

function SessionCard({ row, showTeacher, isTeacherOwn }: { row: CourseScheduleRow; showTeacher?: boolean; isTeacherOwn?: boolean }) {
  const isPastOrToday = row.schedule_date <= today();
  const body = (
    <div
      className={cn(
        "rounded-lg border border-slate-200 border-l-4 bg-white p-2 text-left dark:border-slate-800 dark:bg-slate-900",
        COLOR_MAP[row.class_schedule_color ?? ""] ?? "border-l-brand-500",
      )}
    >
      <p className="truncate text-xs font-semibold">{row.course}</p>
      <p className="truncate text-[11px] text-slate-500">
        {showTeacher ? row.instructor_name ?? "" : row.student_group}
        {row.room ? ` · ${row.room}` : ""}
      </p>
      <p className="text-[11px] text-slate-400">
        {formatTime(row.from_time)}–{formatTime(row.to_time)}
      </p>
    </div>
  );
  if (isTeacherOwn && isPastOrToday) {
    return <Link to={`/attendance/take/${encodeURIComponent(row.name)}`}>{body}</Link>;
  }
  return body;
}

export default function TimetablePage() {
  const session = useSession();
  const { groups } = useMyGroups();
  const [mode, setMode] = useState<"mine" | "section">(session.instructor ? "mine" : "section");
  const [group, setGroup] = useState<string | null>(null);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [mobileDay, setMobileDay] = useState(() => Math.min(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1, 6));

  const effectiveGroup = group ?? groups[0]?.name ?? null;
  const q = useWeekSchedule(mode, effectiveGroup, start);
  const holidays = useHolidays(start);

  // The current week is frequently empty — at a year boundary, or before the
  // next term's schedules have been generated — and an empty grid reads as a
  // broken app rather than an empty calendar. So if this week has nothing,
  // fall back once to the most recent week that does.
  const latest = useQuery({
    queryKey: ["latest-schedule", mode, effectiveGroup, session.instructor?.name],
    enabled: mode === "mine" ? !!session.instructor : !!effectiveGroup,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const rows = await getList<{ schedule_date: string }>("Course Schedule", {
        filters:
          mode === "mine"
            ? [["instructor", "=", session.instructor!.name]]
            : [["student_group", "=", effectiveGroup!]],
        fields: ["schedule_date"],
        orderBy: "schedule_date desc",
        limit: 1,
      }).catch(() => []);
      return rows[0]?.schedule_date ?? null;
    },
  });

  const [jumpedTo, setJumpedTo] = useState<string | null>(null);
  const [didJump, setDidJump] = useState(false);
  useEffect(() => {
    if (didJump || q.isLoading || !latest.data) return;
    if ((q.data?.length ?? 0) > 0) {
      setDidJump(true);
      return;
    }
    const last = parseYmd(latest.data);
    if (last < start) {
      setStart(weekStart(last));
      setJumpedTo(latest.data);
    }
    setDidJump(true);
  }, [didJump, q.isLoading, q.data, latest.data, start]);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(start, i)), [start]); // Mon–Sat
  const byDay = useMemo(() => {
    const m = new Map<string, CourseScheduleRow[]>();
    for (const r of q.data ?? []) {
      const list = m.get(r.schedule_date) ?? [];
      list.push(r);
      m.set(r.schedule_date, list);
    }
    return m;
  }, [q.data]);

  const holidayByDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidays.data ?? []) m.set(h.holiday_date, h.description?.replace(/<[^>]+>/g, "") ?? "Holiday");
    return m;
  }, [holidays.data]);

  const tabs = [
    ...(session.instructor ? [{ key: "mine", label: "My timetable" }] : []),
    ...(groups.length ? [{ key: "section", label: "Section timetable" }] : []),
  ];

  return (
    <div>
      <PageTitle title="Timetable" subtitle={mode === "mine" ? session.instructor?.instructor_name ?? "" : undefined} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs tabs={tabs} active={mode} onChange={(k) => setMode(k as "mine" | "section")} />
        {mode === "section" && (
          <Select className="max-w-56" value={effectiveGroup ?? ""} onChange={(e) => setGroup(e.target.value)} aria-label="Student group">
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.student_group_name}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button aria-label="Previous week" onClick={() => setStart((s) => addDays(s, -7))} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setStart(weekStart(new Date()))}
            className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Today
          </button>
          <button aria-label="Next week" onClick={() => setStart((s) => addDays(s, 7))} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Week of {dualDate(start)} — {ymd(start)} to {ymd(addDays(start, 5))}
      </p>
      {jumpedTo && (
        <Card className="mb-3 flex items-start gap-2 py-2.5">
          <CalendarDays size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Nothing is scheduled for the current week, so this is the most recent week with lessons. Use{" "}
            <b>Today</b> to jump back.
          </p>
        </Card>
      )}

      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          {/* mobile: day switcher + list */}
          <div className="md:hidden">
            <div className="mb-3 grid grid-cols-6 gap-1">
              {days.map((d, i) => {
                const isToday = ymd(d) === today();
                return (
                  <button
                    key={i}
                    onClick={() => setMobileDay(i)}
                    className={cn(
                      "rounded-lg py-2 text-center text-xs font-medium",
                      mobileDay === i
                        ? "bg-brand-600 text-white"
                        : isToday
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                    )}
                  >
                    {DAY_LABELS[i]}
                    <br />
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            {(() => {
              const d = days[mobileDay];
              const key = ymd(d);
              const rows = byDay.get(key) ?? [];
              const holiday = holidayByDay.get(key);
              if (holiday)
                return (
                  <Card className="border-accent-500/40 bg-accent-500/10">
                    <p className="text-sm font-semibold">🎉 {holiday}</p>
                    <p className="text-xs text-slate-500">School holiday — no classes.</p>
                  </Card>
                );
              if (!rows.length) return <EmptyState title="No classes" hint="Nothing scheduled for this day." icon={<CalendarDays size={40} />} />;
              return (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <SessionCard key={r.name} row={r} showTeacher={mode === "section"} isTeacherOwn={mode === "mine"} />
                  ))}
                </div>
              );
            })()}
          </div>

          {/* desktop: week grid */}
          <div className="scroll-thin hidden overflow-x-auto md:block">
            <div className="grid min-w-[900px] grid-cols-6 gap-2">
              {days.map((d, i) => {
                const key = ymd(d);
                const rows = byDay.get(key) ?? [];
                const holiday = holidayByDay.get(key);
                const isToday = key === today();
                return (
                  <div key={i} className={cn("rounded-xl p-2", isToday && "bg-brand-50/60 dark:bg-brand-900/20")}>
                    <p className="mb-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {DAY_LABELS[i]} {d.getDate()}
                      {isToday && <Badge tone="brand" className="ml-1">Today</Badge>}
                    </p>
                    {holiday ? (
                      <div className="rounded-lg border border-accent-500/40 bg-accent-500/10 p-2 text-center text-xs font-medium">🎉 {holiday}</div>
                    ) : rows.length ? (
                      <div className="space-y-1.5">
                        {rows.map((r) => (
                          <SessionCard key={r.name} row={r} showTeacher={mode === "section"} isTeacherOwn={mode === "mine"} />
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-xs text-slate-400">—</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
