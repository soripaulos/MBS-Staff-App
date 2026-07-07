import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getList } from "@/lib/api";
import { useAcademic } from "@/providers/AcademicProvider";
import { bandClass, letterGrade } from "@/lib/grades";
import { cn, round1 } from "@/lib/utils";
import { EXAMS } from "@/lib/constants";
import type { SubjectResultRow, TermReportRow, YearReportRow } from "@/lib/types";
import { Card, EmptyState, ErrorState, ListSkeleton, PageTitle } from "@/components/ui";

export default function StudentResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { year } = useAcademic();

  const q = useQuery({
    queryKey: ["student-results", id, year],
    enabled: !!id && !!year,
    queryFn: async () => {
      const [subjectRows, termReports, yearReports] = await Promise.all([
        getList<SubjectResultRow>("Student Term Subject Result", {
          filters: [["student", "=", id!], ["academic_year", "=", year!]],
          fields: ["name", "student", "student_name", "subject", "exam", "score", "max_score", "semester"],
          limit: 500,
        }),
        getList<TermReportRow>("Student Term Report", {
          filters: [["student", "=", id!], ["academic_year", "=", year!]],
          fields: ["name", "student", "student_name", "academic_term", "term_average", "rank_in_group", "student_group"],
          limit: 10,
        }).catch(() => [] as TermReportRow[]),
        getList<YearReportRow>("Student Year Report", {
          filters: [["student", "=", id!], ["academic_year", "=", year!]],
          fields: ["name", "student", "student_name", "year_average", "rank_in_group", "student_group"],
          limit: 5,
        }).catch(() => [] as YearReportRow[]),
      ]);
      return { subjectRows, termReports, yearReports };
    },
  });

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { subjectRows = [], termReports = [], yearReports = [] } = q.data ?? {};
  const studentName = subjectRows[0]?.student_name ?? termReports[0]?.student_name ?? id;

  const terms = [...new Set(subjectRows.map((r) => r.semester ?? ""))].filter(Boolean).sort();

  return (
    <div className="space-y-4">
      <Link to={`/students/${encodeURIComponent(id!)}`} className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300">
        <ArrowLeft size={16} /> {studentName}
      </Link>
      <PageTitle title={`Results — ${studentName}`} subtitle={year ?? undefined} />

      <div className="grid gap-3 sm:grid-cols-3">
        {termReports.map((t) => (
          <Card key={t.name}>
            <p className="text-xs text-slate-500">{t.academic_term}</p>
            <p className={cn("text-2xl font-bold", bandClass(t.term_average))}>
              {round1(t.term_average)} <span className="text-base">{letterGrade(t.term_average)}</span>
            </p>
            <p className="text-xs text-slate-500">Rank {t.rank_in_group} in {t.student_group}</p>
          </Card>
        ))}
        {yearReports.map((t) => (
          <Card key={t.name} className="border-brand-300 dark:border-brand-800">
            <p className="text-xs text-slate-500">Year average</p>
            <p className={cn("text-2xl font-bold", bandClass(t.year_average))}>
              {round1(t.year_average)} <span className="text-base">{letterGrade(t.year_average)}</span>
            </p>
            <p className="text-xs text-slate-500">Rank {t.rank_in_group}</p>
          </Card>
        ))}
      </div>

      {!subjectRows.length ? (
        <EmptyState title="No subject results" hint="No exam scores recorded for this academic year yet." />
      ) : (
        terms.map((term) => {
          const rowsOfTerm = subjectRows.filter((r) => r.semester === term);
          const subjects = [...new Set(rowsOfTerm.map((r) => r.subject))].sort();
          const exams = EXAMS.filter((e) => rowsOfTerm.some((r) => r.exam === e));
          return (
            <Card key={term} className="p-0">
              <p className="px-4 py-3 text-sm font-semibold">{term}</p>
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[560px] border-t border-slate-200 text-sm dark:border-slate-800">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                      <th className="px-4 py-2">Subject</th>
                      {exams.map((e) => (
                        <th key={e} className="px-3 py-2 text-right">{e}</th>
                      ))}
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">%</th>
                      <th className="px-3 py-2 text-right">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {subjects.map((s) => {
                      const rows = rowsOfTerm.filter((r) => r.subject === s);
                      const total = rows.reduce((a, r) => a + r.score, 0);
                      const max = rows.reduce((a, r) => a + r.max_score, 0);
                      const p = max ? (total / max) * 100 : 0;
                      return (
                        <tr key={s}>
                          <td className="px-4 py-2 font-medium">{s}</td>
                          {exams.map((e) => {
                            const r = rows.find((x) => x.exam === e);
                            return (
                              <td key={e} className="px-3 py-2 text-right tabular-nums">
                                {r ? r.score : <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 text-right tabular-nums">
                            {round1(total)}<span className="text-xs text-slate-400">/{round1(max)}</span>
                          </td>
                          <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", bandClass(p))}>{round1(p)}</td>
                          <td className={cn("px-3 py-2 text-right font-bold", bandClass(p))}>{letterGrade(p)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
