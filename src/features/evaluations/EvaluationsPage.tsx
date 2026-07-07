import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { getList } from "@/lib/api";
import { useSession } from "@/providers/SessionProvider";
import { ratingToStars, round1 } from "@/lib/utils";
import { Card, EmptyState, ErrorState, ListSkeleton, PageTitle, Stars } from "@/components/ui";

/** Teacher Evaluation rating criteria (Frappe Rating fields store 0..1). */
const CRITERIA: [string, string][] = [
  ["respect", "Respect for students"],
  ["exams", "Quality of exams"],
  ["communication_skill", "Communication"],
  ["followup", "Student follow-up"],
  ["homework", "Homework"],
  ["knowledge", "Subject knowledge"],
];

interface EvalRow {
  name: string;
  instructors: string;
  student_group?: string;
  review_date?: string;
  respect?: number;
  exams?: number;
  communication_skill?: number;
  followup?: number;
  homework?: number;
  knowledge?: number;
}

interface Aggregate {
  instructor: string;
  count: number;
  perCriterion: Record<string, number>; // average stars
  overall: number;
}

function aggregate(rows: EvalRow[]): Map<string, Aggregate> {
  const map = new Map<string, { count: number; sums: Record<string, number>; ns: Record<string, number> }>();
  for (const r of rows) {
    const key = r.instructors;
    const agg = map.get(key) ?? { count: 0, sums: {}, ns: {} };
    agg.count++;
    for (const [field] of CRITERIA) {
      const v = r[field as keyof EvalRow];
      if (typeof v === "number" && v > 0) {
        agg.sums[field] = (agg.sums[field] ?? 0) + v;
        agg.ns[field] = (agg.ns[field] ?? 0) + 1;
      }
    }
    map.set(key, agg);
  }
  const out = new Map<string, Aggregate>();
  for (const [k, v] of map) {
    const perCriterion: Record<string, number> = {};
    let total = 0;
    let n = 0;
    for (const [field] of CRITERIA) {
      if (v.ns[field]) {
        perCriterion[field] = ratingToStars(v.sums[field] / v.ns[field]);
        total += perCriterion[field];
        n++;
      }
    }
    out.set(k, { instructor: k, count: v.count, perCriterion, overall: n ? round1(total / n) : 0 });
  }
  return out;
}

function CriterionBars({ agg }: { agg: Aggregate }) {
  return (
    <div className="space-y-2">
      {CRITERIA.filter(([f]) => agg.perCriterion[f] !== undefined).map(([field, label]) => {
        const v = agg.perCriterion[field];
        return (
          <div key={field}>
            <div className="mb-0.5 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">{label}</span>
              <span className="font-semibold tabular-nums">{v}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full" style={{ width: `${(v / 5) * 100}%`, background: "var(--viz-series-1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EvaluationsPage() {
  const session = useSession();
  const [selectedInstructor, setSelectedInstructor] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["teacher-evals", session.instructor?.name, session.isLeadership],
    enabled: !!session.instructor || session.isLeadership,
    queryFn: () =>
      getList<EvalRow>("Teacher Evaluation", {
        // Teachers: only their own rows. Anonymity: reviewer is never requested.
        filters: session.isLeadership ? [] : [["instructors", "=", session.instructor!.name]],
        fields: ["name", "instructors", "student_group", "review_date", ...CRITERIA.map(([f]) => f)],
        orderBy: "review_date desc",
        limit: 5000,
      }),
  });

  const aggregates = useMemo(() => aggregate(q.data ?? []), [q.data]);
  const myAgg = session.instructor ? aggregates.get(session.instructor.name) : undefined;

  if (q.isLoading || session.loading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const sorted = [...aggregates.values()].sort((a, b) => b.overall - a.overall);
  const detail = selectedInstructor ? aggregates.get(selectedInstructor) : undefined;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Teacher evaluations"
        subtitle="Ratings submitted by parents and students through the student app. Responses are anonymous — reviewer identity is never shown."
      />

      {myAgg && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">My evaluation summary</h2>
            <div className="flex items-center gap-2">
              <Stars value={myAgg.overall} />
              <span className="text-sm font-bold">{myAgg.overall}</span>
              <span className="text-xs text-slate-400">({myAgg.count} reviews)</span>
            </div>
          </div>
          <CriterionBars agg={myAgg} />
        </Card>
      )}

      {!myAgg && session.instructor && (
        <EmptyState title="No evaluations yet" hint="When parents rate your teaching in the student app, your anonymous summary appears here." icon={<Star size={40} />} />
      )}

      {session.isLeadership && (
        <Card className="p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="font-semibold">All teachers</h2>
            <span className="text-xs text-slate-400">{sorted.length} teachers · {q.data?.length ?? 0} reviews</span>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] border-t border-slate-200 text-sm dark:border-slate-800">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                  <th className="px-4 py-2">Teacher</th>
                  <th className="px-3 py-2 text-right">Reviews</th>
                  <th className="px-3 py-2 text-right">Overall</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((a) => (
                  <tr key={a.instructor} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-medium">{a.instructor}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.count}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        {a.overall} <Stars value={a.overall} size={13} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="text-xs font-medium text-brand-600 dark:text-brand-300"
                        onClick={() => setSelectedInstructor(selectedInstructor === a.instructor ? null : a.instructor)}
                      >
                        {selectedInstructor === a.instructor ? "Hide" : "Detail"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail && (
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <p className="mb-2 text-sm font-semibold">{detail.instructor}</p>
              <CriterionBars agg={detail} />
            </div>
          )}
        </Card>
      )}

      {session.isLeadership && !sorted.length && <EmptyState title="No evaluations recorded" />}

      {!session.isLeadership && myAgg && (
        <p className="text-xs text-slate-400">
          You see aggregated averages only. Individual responses are restricted to school administration for formal review.
        </p>
      )}
    </div>
  );
}
