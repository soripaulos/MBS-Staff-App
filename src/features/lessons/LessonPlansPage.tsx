import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, Plus } from "lucide-react";
import { getList } from "@/lib/api";
import { addDays, formatDate, parseYmd, today, weekStart, ymd } from "@/lib/dates";
import { useSession } from "@/providers/SessionProvider";
import { useMyGroups } from "@/features/shared/useGroups";
import type { CourseScheduleRow, LessonPlanRow } from "@/lib/types";
import { Badge, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, PageTitle, Select, Tabs } from "@/components/ui";
import { cn, round1 } from "@/lib/utils";

/**
 * Lesson plans, listed two ways.
 *
 * **Plans** is the record — what was planned and how much of it landed.
 * **Timetable** is the working view: this week's lessons with their plan
 * attached, and a one-tap way to start a plan for a lesson that hasn't got one.
 * That second view is the one that gets used, because it is the only place
 * where "which of my lessons has no plan yet" is visible at a glance.
 */

const PLAN_FIELDS = [
  "name", "title", "course", "student_group", "instructor", "plan_date", "course_schedule",
  "status", "unit", "topic", "coverage", "carried_from", "carried_to",
];

function StatusBadge({ status }: { status: LessonPlanRow["status"] }) {
  const tone =
    status === "Taught" ? "green" : status === "Partially taught" ? "amber" : status === "Not taught" ? "red" : status === "Carried forward" ? "blue" : "slate";
  return <Badge tone={tone as never}>{status}</Badge>;
}

function PlanCard({ plan }: { plan: LessonPlanRow }) {
  return (
    <Link to={`/lessons/${encodeURIComponent(plan.name)}`}>
      <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{plan.title}</p>
          <p className="truncate text-xs text-slate-500">
            {plan.course} · {plan.student_group} · {formatDate(plan.plan_date)}
            {plan.unit ? ` · ${plan.unit}` : ""}
          </p>
          {plan.carried_from && <p className="text-[11px] text-sky-600 dark:text-sky-400">Carried over from an earlier lesson</p>}
          {plan.carried_to && <p className="text-[11px] text-slate-400">Remainder moved to a later lesson</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={plan.status} />
          {plan.status !== "Planned" && typeof plan.coverage === "number" && (
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                plan.coverage >= 80 ? "text-emerald-600" : plan.coverage >= 50 ? "text-amber-600" : "text-red-600",
              )}
            >
              {round1(plan.coverage)}% covered
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

/** This week's timetabled lessons, each with its plan or a link to write one. */
function WeekView({ from, to }: { from: string; to: string }) {
  const session = useSession();

  const q = useQuery({
    queryKey: ["lesson-week", session.instructor?.name, from, to],
    enabled: !!session.instructor,
    queryFn: async () => {
      const [schedules, plans] = await Promise.all([
        getList<CourseScheduleRow>("Course Schedule", {
          filters: [
            ["instructor", "=", session.instructor!.name],
            ["schedule_date", "between", [from, to]],
          ] as never,
          fields: ["name", "course", "student_group", "schedule_date", "from_time", "to_time", "room"],
          orderBy: "schedule_date asc, from_time asc",
          limit: 200,
        }),
        getList<LessonPlanRow>("Lesson Plan", {
          filters: [["plan_date", "between", [from, to]]] as never,
          fields: PLAN_FIELDS,
          limit: 200,
        }).catch(() => [] as LessonPlanRow[]),
      ]);
      return { schedules, plans };
    },
  });

  const byDay = useMemo(() => {
    if (!q.data) return [];
    const bySchedule = new Map(q.data.plans.filter((p) => p.course_schedule).map((p) => [p.course_schedule!, p]));
    const days = new Map<string, { schedule: CourseScheduleRow; plan?: LessonPlanRow }[]>();
    for (const s of q.data.schedules) {
      const list = days.get(s.schedule_date) ?? [];
      list.push({ schedule: s, plan: bySchedule.get(s.name) });
      days.set(s.schedule_date, list);
    }
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data]);

  if (!session.instructor) return <EmptyState title="No timetable" hint="This view is for staff who teach timetabled lessons." />;
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!byDay.length)
    return <EmptyState title="No lessons this week" hint="Pick another week, or write a plan that isn't tied to a timetabled lesson." icon={<CalendarDays size={40} />} />;

  return (
    <div className="space-y-4">
      {byDay.map(([date, rows]) => (
        <div key={date}>
          <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{formatDate(date)}</h2>
          <div className="space-y-2">
            {rows.map(({ schedule, plan }) =>
              plan ? (
                <PlanCard key={schedule.name} plan={plan} />
              ) : (
                <Link key={schedule.name} to={`/lessons/new?schedule=${encodeURIComponent(schedule.name)}`}>
                  <Card className="flex items-center gap-3 border-dashed transition-shadow hover:shadow-md">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {schedule.course} · {schedule.student_group}
                      </p>
                      <p className="text-xs text-slate-400">No plan yet</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg border border-brand-300 px-2.5 py-1.5 text-xs font-medium text-brand-700 dark:border-brand-800 dark:text-brand-300">
                      <Plus size={14} /> Plan
                    </span>
                  </Card>
                </Link>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LessonPlansPage() {
  const { groups } = useMyGroups();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "week";
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });

  const [anchor, setAnchor] = useState(() => ymd(weekStart(new Date())));
  const from = anchor;
  const to = ymd(addDays(parseYmd(anchor), 6));

  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("All");

  const plans = useQuery({
    queryKey: ["lesson-plans", group, status],
    enabled: tab === "plans",
    queryFn: () =>
      getList<LessonPlanRow>("Lesson Plan", {
        filters: [
          ...(group ? [["student_group", "=", group]] : []),
          ...(status !== "All" ? [["status", "=", status]] : []),
        ] as never,
        fields: PLAN_FIELDS,
        orderBy: "plan_date desc",
        limit: 200,
      }),
  });

  return (
    <div>
      <PageTitle
        title="Lesson plans"
        subtitle="What you meant to teach, and what actually landed"
        actions={
          <Link
            to="/lessons/new"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} /> <span className="hidden sm:inline">New plan</span>
          </Link>
        }
      />

      <div className="mb-3">
        <Tabs
          tabs={[
            { key: "week", label: "This week" },
            { key: "plans", label: "All plans" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "week" ? (
        <>
          <div className="mb-3 flex items-end gap-2">
            <div>
              <Label>Week beginning</Label>
              <Input type="date" className="max-w-44" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </div>
            <button
              className="mb-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-300"
              onClick={() => setAnchor(ymd(weekStart(new Date())))}
            >
              This week
            </button>
            <span className="mb-2 ml-auto text-xs text-slate-400">{today() >= from && today() <= to ? "Current week" : ""}</span>
          </div>
          <WeekView from={from} to={to} />
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select className="max-w-56" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Section">
              <option value="">All sections</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.student_group_name}
                </option>
              ))}
            </Select>
            <Select className="max-w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              {["All", "Planned", "Taught", "Partially taught", "Not taught", "Carried forward"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          {plans.isLoading ? (
            <ListSkeleton rows={6} />
          ) : plans.isError ? (
            <ErrorState error={plans.error} retry={() => plans.refetch()} />
          ) : !plans.data?.length ? (
            <EmptyState
              title="No lesson plans yet"
              hint="Start one from this week's timetable, or write a standalone plan."
              icon={<BookOpen size={40} />}
            />
          ) : (
            <div className="space-y-2">
              {plans.data.map((p) => (
                <PlanCard key={p.name} plan={p} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
