import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCount, getList } from "@/lib/api";
import { useAcademic } from "@/providers/AcademicProvider";
import { useSession } from "@/providers/SessionProvider";
import { Card, EmptyState, ListSkeleton, PageTitle, Skeleton } from "@/components/ui";
import { round1 } from "@/lib/utils";

/* charts follow the dataviz method: one axis, thin marks, recessive grid,
   validated reference palette via CSS vars, tooltips on hover, text in ink tokens */

const GRID = "var(--viz-grid)";
const MUTED = "var(--viz-muted)";
const S1 = "var(--viz-series-1)";
const S2 = "var(--viz-series-2)";

function monthKey(d: string): string {
  return d.slice(0, 7);
}

function monthLabel(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function useYearRange() {
  const { years, year } = useAcademic();
  const y = years.find((x) => x.name === year);
  return { from: y?.year_start_date ?? `${new Date().getFullYear()}-01-01`, to: y?.year_end_date ?? `${new Date().getFullYear()}-12-31` };
}

function ChartCard({ title, hint, children, loading }: { title: string; hint?: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-slate-400">{hint}</p>}
      {loading ? <Skeleton className="mt-2 h-56 w-full" /> : children}
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: "rgb(15 23 42 / 0.92)",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
};

export default function AnalyticsPage() {
  const session = useSession();
  const { term } = useAcademic();
  const range = useYearRange();

  const genders = useQuery({
    queryKey: ["stats-gender"],
    queryFn: async () => {
      const [male, female, total] = await Promise.all([
        getCount("Student", [["enabled", "=", 1], ["gender", "=", "Male"]]),
        getCount("Student", [["enabled", "=", 1], ["gender", "=", "Female"]]),
        getCount("Student", [["enabled", "=", 1]]),
      ]);
      return { male, female, other: Math.max(0, total - male - female), total };
    },
  });

  const lates = useQuery({
    queryKey: ["stats-lates", range.from, range.to],
    queryFn: () =>
      getList<{ date: string }>("Student Late Day", {
        filters: [["date", "between", [range.from, range.to]], ["docstatus", "!=", 2]] as never,
        fields: ["date"],
        limit: 5000,
      }).catch(() => []),
  });

  const sicks = useQuery({
    queryKey: ["stats-sicks", range.from, range.to],
    queryFn: () =>
      getList<{ date: string; type?: string }>("Student Sick Day", {
        filters: [["date", "between", [range.from, range.to]], ["docstatus", "!=", 2]] as never,
        fields: ["date", "type"],
        limit: 5000,
      }).catch(() => []),
  });

  const averages = useQuery({
    queryKey: ["stats-averages", term],
    enabled: !!term,
    queryFn: () =>
      getList<{ term_average: number }>("Student Term Report", {
        filters: [["academic_term", "=", term!]],
        fields: ["term_average"],
        limit: 5000,
      }).catch(() => []),
  });

  const monthly = useMemo(() => {
    const m = new Map<string, { month: string; late: number; sick: number }>();
    for (const r of lates.data ?? []) {
      const k = monthKey(r.date);
      const e = m.get(k) ?? { month: k, late: 0, sick: 0 };
      e.late++;
      m.set(k, e);
    }
    for (const r of sicks.data ?? []) {
      const k = monthKey(r.date);
      const e = m.get(k) ?? { month: k, late: 0, sick: 0 };
      e.sick++;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((e) => ({ ...e, label: monthLabel(e.month) }));
  }, [lates.data, sicks.data]);

  const histogram = useMemo(() => {
    const bins = [
      { label: "<50", min: 0, max: 50, n: 0 },
      { label: "50–59", min: 50, max: 60, n: 0 },
      { label: "60–69", min: 60, max: 70, n: 0 },
      { label: "70–79", min: 70, max: 80, n: 0 },
      { label: "80–89", min: 80, max: 90, n: 0 },
      { label: "90–100", min: 90, max: 101, n: 0 },
    ];
    for (const r of averages.data ?? []) {
      const v = r.term_average;
      const bin = bins.find((b) => v >= b.min && v < b.max);
      if (bin) bin.n++;
    }
    return bins;
  }, [averages.data]);

  const sickByType = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sicks.data ?? []) m.set(r.type ?? "Other", (m.get(r.type ?? "Other") ?? 0) + 1);
    return [...m.entries()].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
  }, [sicks.data]);

  if (!session.isLeadership) {
    return <EmptyState title="Analytics is for school leadership" hint="Ask an administrator if you believe you should have access." />;
  }
  if (session.loading) return <ListSkeleton rows={6} />;

  const g = genders.data;
  const passCount = (averages.data ?? []).filter((r) => r.term_average >= 60).length;
  const avgOfAvgs = averages.data?.length
    ? round1((averages.data.reduce((a, r) => a + r.term_average, 0) / averages.data.length) as number)
    : null;

  return (
    <div className="space-y-4">
      <PageTitle title="Analytics" subtitle="School-wide trends for the selected year and term" />

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Active students</p>
          {genders.isLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold">{g?.total ?? "—"}</p>}
          {g && (
            <p className="text-xs text-slate-400">
              {g.male} male · {g.female} female
            </p>
          )}
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Sex ratio</p>
          {genders.isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">{g && g.total ? `${Math.round((g.male / g.total) * 100)}∶${Math.round((g.female / g.total) * 100)}` : "—"}</p>
          )}
          <p className="text-xs text-slate-400">male ∶ female</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Term average (mean)</p>
          {averages.isLoading ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-bold">{avgOfAvgs ?? "—"}</p>}
          <p className="text-xs text-slate-400">{term ?? ""}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Pass rate (≥60)</p>
          {averages.isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">
              {averages.data?.length ? `${Math.round((passCount / averages.data.length) * 100)}%` : "—"}
            </p>
          )}
          <p className="text-xs text-slate-400">{averages.data?.length ?? 0} term reports</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Late & sick, by month" hint="Count of records across the academic year" loading={lates.isLoading || sicks.isLoading}>
          {monthly.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="late" name="Late" stroke={S1} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="sick" name="Sick" stroke={S2} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No data yet" />
          )}
          <div className="mt-1 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: S1 }} /> Late</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: S2 }} /> Sick</span>
          </div>
        </ChartCard>

        <ChartCard title="Term average distribution" hint={`Student Term Reports · ${term ?? ""}`} loading={averages.isLoading}>
          {averages.data?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgb(148 163 184 / 0.1)" }} />
                <Bar dataKey="n" name="Students" fill={S1} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No term reports for this term" />
          )}
        </ChartCard>

        <ChartCard title="Sick days by type" hint="Across the academic year" loading={sicks.isLoading}>
          {sickByType.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, sickByType.length * 36)}>
              <BarChart data={sickByType} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRID }} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="type" width={96} tick={{ fontSize: 11, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgb(148 163 184 / 0.1)" }} />
                <Bar dataKey="n" name="Records" fill={S2} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="No sick records" />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
