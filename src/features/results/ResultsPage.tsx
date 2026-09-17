import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, GraduationCap } from "lucide-react";
import { useSession } from "@/providers/SessionProvider";
import { useAcademic } from "@/providers/AcademicProvider";
import { getList, updateDoc, fileUrl } from "@/lib/api";
import { EXAMS } from "@/lib/constants";
import { bandClass, letterGrade } from "@/lib/grades";
import { cn, downloadCsv, round1 } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { AppealRow, SubjectResultRow, TermReportRow, YearReportRow } from "@/lib/types";
import { useGroupSubjects, useMyGroups } from "@/features/shared/useGroups";
import { Badge, Button, Card, EmptyState, ErrorState, Label, ListSkeleton, Modal, PageTitle, Select, Tabs, Textarea, statusTone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

function useGroupResults(group: string | null, term: string | null) {
  return useQuery({
    queryKey: ["stsr", group, term],
    enabled: !!group && !!term,
    queryFn: () =>
      getList<SubjectResultRow>("Student Term Subject Result", {
        filters: [["student_group", "=", group!], ["semester", "=", term!]],
        fields: ["name", "student", "student_name", "subject", "exam", "score", "max_score"],
        limit: 5000,
      }),
  });
}

interface StudentPivot {
  student: string;
  student_name: string;
  byExam: Record<string, { score: number; max: number }>;
  total: number;
  totalMax: number;
}

function pivotBySubject(rows: SubjectResultRow[], subject: string): StudentPivot[] {
  const map = new Map<string, StudentPivot>();
  for (const r of rows) {
    if (r.subject !== subject) continue;
    let p = map.get(r.student);
    if (!p) {
      p = { student: r.student, student_name: r.student_name, byExam: {}, total: 0, totalMax: 0 };
      map.set(r.student, p);
    }
    p.byExam[r.exam] = { score: r.score, max: r.max_score };
    p.total += r.score;
    p.totalMax += r.max_score;
  }
  return [...map.values()].sort((a, b) => a.student_name.localeCompare(b.student_name));
}

/* ------------------------------------------------------------------ */
/* marks grid                                                          */
/* ------------------------------------------------------------------ */

function MarksGrid({ rows, subject, group }: { rows: SubjectResultRow[]; subject: string; group: string }) {
  const pivots = useMemo(() => pivotBySubject(rows, subject), [rows, subject]);
  const exams = useMemo(() => {
    const present = new Set(rows.filter((r) => r.subject === subject).map((r) => r.exam));
    const ordered = EXAMS.filter((e) => present.has(e));
    for (const e of present) if (!ordered.includes(e as never)) ordered.push(e as never);
    return ordered as string[];
  }, [rows, subject]);

  if (!pivots.length) return <EmptyState title="No results yet" hint="No scores recorded for this subject and term." icon={<GraduationCap size={40} />} />;

  const exportCsv = () => {
    const header = ["Student", ...exams, "Total", "Max", "%", "Grade"];
    const body = pivots.map((p) => {
      const pctVal = p.totalMax ? (p.total / p.totalMax) * 100 : 0;
      return [
        p.student_name,
        ...exams.map((e) => p.byExam[e]?.score ?? ""),
        p.total,
        p.totalMax,
        round1(pctVal),
        letterGrade(pctVal),
      ];
    });
    downloadCsv(`${group} - ${subject}.csv`, [header, ...body]);
  };

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold">
          {subject} · {pivots.length} students
        </p>
        <Button variant="secondary" onClick={exportCsv} className="min-h-0 px-3 py-1.5 text-xs">
          <Download size={14} /> CSV
        </Button>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[640px] border-t border-slate-200 text-sm dark:border-slate-800">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 dark:bg-slate-800/95">Student</th>
              {exams.map((e) => (
                <th key={e} className="px-3 py-2 text-right">
                  {e}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">%</th>
              <th className="px-3 py-2 text-right">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pivots.map((p) => {
              const pctVal = p.totalMax ? (p.total / p.totalMax) * 100 : 0;
              return (
                <tr key={p.student} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="sticky left-0 z-10 max-w-52 truncate bg-white px-4 py-2 font-medium dark:bg-slate-900">
                    <Link to={`/students/${encodeURIComponent(p.student)}`} className="hover:text-brand-600">
                      {p.student_name}
                    </Link>
                  </td>
                  {exams.map((e) => (
                    <td key={e} className="px-3 py-2 text-right tabular-nums">
                      {p.byExam[e] ? p.byExam[e].score : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {round1(p.total)}
                    <span className="text-xs text-slate-400">/{round1(p.totalMax)}</span>
                  </td>
                  <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", bandClass(pctVal))}>{round1(pctVal)}</td>
                  <td className={cn("px-3 py-2 text-right font-bold", bandClass(pctVal))}>{letterGrade(pctVal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* section overview (homeroom / leadership)                            */
/* ------------------------------------------------------------------ */

function SectionOverview({ group, term, rows }: { group: string; term: string; rows: SubjectResultRow[] }) {
  const reports = useQuery({
    queryKey: ["term-reports", group, term],
    queryFn: () =>
      getList<TermReportRow>("Student Term Report", {
        filters: [["student_group", "=", group], ["academic_term", "=", term]],
        fields: ["name", "student", "student_name", "term_average", "rank_in_group"],
        orderBy: "rank_in_group asc",
        limit: 200,
      }),
  });

  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subject))].sort(), [rows]);
  const perStudentSubject = useMemo(() => {
    const m = new Map<string, Map<string, { s: number; mx: number }>>();
    for (const r of rows) {
      const inner = m.get(r.student) ?? new Map<string, { s: number; mx: number }>();
      const cur = inner.get(r.subject) ?? { s: 0, mx: 0 };
      cur.s += r.score;
      cur.mx += r.max_score;
      inner.set(r.subject, cur);
      m.set(r.student, inner);
    }
    return m;
  }, [rows]);

  if (reports.isLoading) return <ListSkeleton rows={6} />;
  if (reports.isError) return <ErrorState error={reports.error} retry={() => reports.refetch()} />;
  const data = reports.data ?? [];
  if (!data.length && !rows.length)
    return <EmptyState title="No term reports yet" hint="Term reports appear once results are compiled for this term." />;

  // Fall back to raw results when Student Term Reports haven't been generated.
  const students = data.length
    ? data
    : [...new Map(rows.map((r) => [r.student, { name: "", student: r.student, student_name: r.student_name, term_average: NaN, rank_in_group: NaN }])).values()];

  return (
    <Card className="p-0">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
              <th className="px-3 py-2">#</th>
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 dark:bg-slate-800/95">Student</th>
              {subjects.map((s) => (
                <th key={s} className="max-w-24 truncate px-2 py-2 text-right" title={s}>
                  {s.length > 10 ? s.slice(0, 9) + "…" : s}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Average</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.map((r) => {
              const subjMap = perStudentSubject.get(r.student);
              return (
                <tr key={r.student} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2 tabular-nums text-slate-500">{Number.isNaN(r.rank_in_group) ? "—" : r.rank_in_group}</td>
                  <td className="sticky left-0 z-10 max-w-48 truncate bg-white px-3 py-2 font-medium dark:bg-slate-900">
                    <Link to={`/students/${encodeURIComponent(r.student)}`} className="hover:text-brand-600">
                      {r.student_name}
                    </Link>
                  </td>
                  {subjects.map((s) => {
                    const v = subjMap?.get(s);
                    const p = v && v.mx ? (v.s / v.mx) * 100 : null;
                    return (
                      <td key={s} className={cn("px-2 py-2 text-right tabular-nums", p !== null && bandClass(p))}>
                        {p === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : round1(p)}
                      </td>
                    );
                  })}
                  <td className={cn("px-3 py-2 text-right font-bold tabular-nums", !Number.isNaN(r.term_average) && bandClass(r.term_average))}>
                    {Number.isNaN(r.term_average) ? "—" : round1(r.term_average)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* year view                                                           */
/* ------------------------------------------------------------------ */

function YearView({ group, year }: { group: string; year: string }) {
  const q = useQuery({
    queryKey: ["year-reports", group, year],
    queryFn: () =>
      getList<YearReportRow>("Student Year Report", {
        filters: [["student_group", "=", group], ["academic_year", "=", year]],
        fields: ["name", "student", "student_name", "year_average", "rank_in_group"],
        orderBy: "rank_in_group asc",
        limit: 200,
      }),
  });
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="No year reports yet" hint="Year reports appear at the end of the academic year." />;
  return (
    <Card className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
            <th className="px-4 py-2">Rank</th>
            <th className="px-4 py-2">Student</th>
            <th className="px-4 py-2 text-right">Year average</th>
            <th className="px-4 py-2 text-right">Grade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {q.data.map((r) => (
            <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-2 tabular-nums text-slate-500">{r.rank_in_group}</td>
              <td className="px-4 py-2 font-medium">
                <Link to={`/students/${encodeURIComponent(r.student)}`} className="hover:text-brand-600">
                  {r.student_name}
                </Link>
              </td>
              <td className={cn("px-4 py-2 text-right font-semibold tabular-nums", bandClass(r.year_average))}>{round1(r.year_average)}</td>
              <td className={cn("px-4 py-2 text-right font-bold", bandClass(r.year_average))}>{letterGrade(r.year_average)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* appeals                                                             */
/* ------------------------------------------------------------------ */

function Appeals({ term }: { term: string | null }) {
  const session = useSession();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AppealRow | null>(null);
  const [resolution, setResolution] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");

  const q = useQuery({
    queryKey: ["appeals", term, statusFilter],
    queryFn: () =>
      getList<AppealRow>("Appeal Result", {
        filters: [
          ...(term ? [["semester", "=", term]] : []),
          ...(statusFilter !== "All" ? [["status", "=", statusFilter]] : []),
        ] as never,
        fields: [
          "name", "student", "student_name", "student_group", "semester", "subject", "exam",
          "original_score", "original_max_score", "reason", "attachment", "status", "resolution", "creation",
        ],
        orderBy: "creation desc",
        limit: 200,
      }),
  });

  const visible = useMemo(() => {
    const rows = q.data ?? [];
    if (session.isLeadership) return rows;
    const mine = new Set(session.subjectPairs.map((p) => `${p.course}::${p.student_group}`));
    return rows.filter((r) => mine.has(`${r.subject}::${r.student_group}`));
  }, [q.data, session]);

  const update = useMutation({
    mutationFn: ({ name, status }: { name: string; status: string }) =>
      updateDoc("Appeal Result", name, { status, resolution }),
    onSuccess: () => {
      setSelected(null);
      setResolution("");
      void qc.invalidateQueries({ queryKey: ["appeals"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="max-w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
          {["Open", "In Review", "Resolved", "Rejected", "All"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <p className="text-xs text-slate-500">
          {session.isLeadership ? "All appeals" : "Appeals for the subjects and sections you teach"}
        </p>
      </div>
      {q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !visible.length ? (
        <EmptyState title="No appeals" hint="Grade appeals raised by parents from the student app will appear here." />
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <button
              key={a.name}
              onClick={() => {
                setSelected(a);
                setResolution(a.resolution ?? "");
              }}
              className="w-full text-left"
            >
              <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {a.student_name} · {a.subject} — {a.exam}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {a.student_group} · score {a.original_score}/{a.original_max_score} · {formatDate(a.creation?.slice(0, 10))}
                  </p>
                </div>
                <Badge tone={statusTone(a.status)}>{a.status}</Badge>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Grade appeal">
        {selected && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">
              {selected.student_name} · {selected.subject} — {selected.exam}
            </p>
            <p className="text-xs text-slate-500">
              {selected.student_group} · {selected.semester} · recorded score{" "}
              <b>
                {selected.original_score}/{selected.original_max_score}
              </b>
            </p>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-medium uppercase text-slate-400">Parent's reason</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.reason || "—"}</p>
            </div>
            {selected.attachment && (
              <a href={fileUrl(selected.attachment)} target="_blank" rel="noreferrer">
                <img src={fileUrl(selected.attachment)} alt="Appeal evidence" className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700" />
              </a>
            )}
            <div>
              <Label>Resolution note</Label>
              <Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What was checked and decided…" />
            </div>
            <p className="text-xs text-slate-400">
              Correcting the actual score is done on the desk (amend the submitted result). This updates the appeal status the parent sees.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ name: selected.name, status: "In Review" })}>
                Mark in review
              </Button>
              <Button variant="danger" disabled={update.isPending} onClick={() => update.mutate({ name: selected.name, status: "Rejected" })}>
                Reject
              </Button>
              <Button disabled={update.isPending} onClick={() => update.mutate({ name: selected.name, status: "Resolved" })}>
                Resolve
              </Button>
            </div>
            {update.isError && <p className="text-xs text-red-600">{(update.error as Error).message}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function ResultsPage() {
  const session = useSession();
  const { year, term } = useAcademic();
  const { groups, loading: groupsLoading } = useMyGroups();
  const [params, setParams] = useSearchParams();

  const [group, setGroup] = useState<string | null>(params.get("group"));
  const effectiveGroup = group ?? groups[0]?.name ?? null;
  const { subjects } = useGroupSubjects(effectiveGroup);
  const [subject, setSubject] = useState<string | null>(null);
  const effectiveSubject = subject && subjects.includes(subject) ? subject : subjects[0] ?? null;

  const canSeeWholeSection =
    session.isLeadership || session.homeroomGroups.some((g) => g.name === effectiveGroup);

  // Grade appeals are reviewed by Education Managers, not subject teachers —
  // the server grants `Appeal Result` to Education Manager and System Manager
  // only, so showing the tab to anyone else would just render a 403.
  const canReviewAppeals = session.isAdmin;
  const requestedTab = params.get("tab") ?? "grid";
  const tab = requestedTab === "appeals" && !canReviewAppeals ? "grid" : requestedTab;
  const setTab = (t: string) => setParams({ ...(effectiveGroup ? { group: effectiveGroup } : {}), tab: t }, { replace: true });

  const results = useGroupResults(tab !== "appeals" ? effectiveGroup : null, term);

  const tabs = [
    { key: "grid", label: "Marks grid" },
    ...(canSeeWholeSection ? [{ key: "overview", label: "Section overview" }, { key: "year", label: "Year" }] : []),
    ...(canReviewAppeals ? [{ key: "appeals", label: "Appeals" }] : []),
  ];

  return (
    <div>
      <PageTitle title="Results" subtitle={term ?? undefined} />
      <div className="mb-3">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab !== "appeals" && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Select
            className="max-w-56"
            value={effectiveGroup ?? ""}
            onChange={(e) => {
              setGroup(e.target.value);
              setSubject(null);
            }}
            aria-label="Student group"
          >
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.student_group_name}
              </option>
            ))}
          </Select>
          {tab === "grid" && (
            <Select className="max-w-56" value={effectiveSubject ?? ""} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          )}
        </div>
      )}

      {tab === "appeals" ? (
        <Appeals term={term} />
      ) : groupsLoading || results.isLoading ? (
        <ListSkeleton rows={6} />
      ) : results.isError ? (
        <ErrorState error={results.error} retry={() => results.refetch()} />
      ) : !effectiveGroup ? (
        <EmptyState title="No sections available" hint="You are not assigned to any student group this year." />
      ) : tab === "grid" ? (
        effectiveSubject ? (
          <MarksGrid rows={results.data ?? []} subject={effectiveSubject} group={effectiveGroup} />
        ) : (
          <EmptyState title="No subjects" hint="No results recorded yet for this section, or you don't teach a subject here." />
        )
      ) : tab === "overview" && term ? (
        <SectionOverview group={effectiveGroup} term={term} rows={results.data ?? []} />
      ) : tab === "year" && year ? (
        <YearView group={effectiveGroup} year={year} />
      ) : null}
    </div>
  );
}
