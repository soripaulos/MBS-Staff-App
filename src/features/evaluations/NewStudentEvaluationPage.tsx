import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Star } from "lucide-react";
import { createDoc, getDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { StudentDoc } from "@/lib/types";
import { Button, Card, ErrorState, Label, ListSkeleton, PageTitle, Select } from "@/components/ui";

/**
 * Create a `Student Hub Evaluation` — the read a teacher gives on a student,
 * which parents see in the student app and can reply to.
 *
 * Frappe Rating fields store 0..1; the UI is five stars, so every value is
 * written as stars / 5. Unrated criteria are omitted from the payload rather
 * than sent as zero, so "not assessed" stays distinct from "rated zero".
 *
 * Subject was added back as a Custom Field on the doctype, so a subject
 * teacher can say which lesson they are speaking from; leaving it blank means
 * a whole-child read. Section, behaviour flags and free-text feedback are
 * deliberately absent — they were removed from the original for a reason.
 *
 * The criteria themselves are still a fixed list every teacher sees, which is
 * what `docs/EVALUATION_PROPOSAL.md` addresses.
 */

const GROUPS: { label: string; fields: [string, string][] }[] = [
  {
    label: "Academics",
    fields: [
      ["maths", "Mathematics"],
      ["science", "Science"],
      ["social_studies", "Social studies"],
      ["reading", "Reading"],
      ["writing", "Writing"],
      ["grammar_and_vocabulary", "Grammar & vocabulary"],
    ],
  },
  {
    label: "Skills",
    fields: [
      ["critical_thinking", "Critical thinking"],
      ["creativity", "Creativity"],
      ["speaking_and_communication_skills", "Speaking & communication"],
      ["digital_literacy", "Digital literacy"],
    ],
  },
  {
    label: "Habits & conduct",
    fields: [
      ["engagement", "Engagement"],
      ["assignment_responsibility", "Assignment responsibility"],
      ["organization", "Organization"],
      ["attendance", "Attendance"],
      ["communicationpeer_relationships", "Peer relationships"],
      ["respect", "Respect"],
      ["leadership", "Leadership"],
      ["emotional_regulation", "Emotional regulation"],
      ["hygiene", "Hygiene"],
    ],
  },
];

function StarInput({
  value,
  onChange,
  label,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} of 5`}
            onClick={() => onChange(value === n ? undefined : n)}
            className="flex h-9 w-8 items-center justify-center"
          >
            <Star
              size={20}
              className={cn(
                "transition-colors",
                value !== undefined && n <= value
                  ? "fill-accent-500 text-accent-500"
                  : "text-slate-300 dark:text-slate-700",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NewStudentEvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const student = useQuery({
    queryKey: ["student", id],
    enabled: !!id,
    queryFn: () => getDoc<StudentDoc>("Student", id!),
  });

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [openSection, setOpenSection] = useState<string>(GROUPS[0].label);
  // Subject is optional: blank means a whole-child / homeroom evaluation.
  // Added back as a Custom Field on the doctype so a subject teacher can say
  // which lesson they are speaking from.
  const [course, setCourse] = useState("");
  const mySubjects = useMemo(
    () => [...new Set(session.subjectPairs.map((p) => p.course))].sort(),
    [session.subjectPairs],
  );

  const ratedCount = Object.keys(ratings).length;
  const totalCriteria = useMemo(() => GROUPS.reduce((a, g) => a + g.fields.length, 0), []);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        student: id,
        review_date: today(),
        status: "Unread",
        ...(course ? { course } : {}),
      };
      // Rating fields are 0..1 on the server; unrated criteria are left out.
      for (const [field, stars] of Object.entries(ratings)) payload[field] = stars / 5;
      return createDoc("Student Hub Evaluation", payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student-evals", id] });
      navigate(`/students/${encodeURIComponent(id!)}?tab=evaluations`, { replace: true });
    },
  });

  if (student.isLoading) return <ListSkeleton rows={6} />;
  if (student.isError) return <ErrorState error={student.error} retry={() => student.refetch()} />;

  const displayName = student.data?.student_name ?? id;

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-6">
      <Link
        to={`/students/${encodeURIComponent(id!)}?tab=evaluations`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300"
      >
        <ArrowLeft size={16} /> {displayName}
      </Link>
      <PageTitle title="New evaluation" subtitle={`${displayName} · ${ratedCount} of ${totalCriteria} rated`} />

      <Card className="mb-3 space-y-3">
        <div>
          <Label>Subject</Label>
          <Select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">Whole child — no specific subject</option>
            {mySubjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Filed as <b>{session.instructor?.instructor_name ?? user}</b>, and shared with the student's parents. Rate
            only what you have actually seen — anything you leave blank is recorded as not assessed, not as a low
            score.
          </p>
        </div>
      </Card>

      {/* Accordions — 19 criteria is too long for one scroll on a phone. */}
      {GROUPS.map((g) => {
        const open = openSection === g.label;
        const rated = g.fields.filter(([f]) => ratings[f] !== undefined).length;
        return (
          <Card key={g.label} className="mb-2 p-0">
            <button
              type="button"
              onClick={() => setOpenSection(open ? "" : g.label)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold">{g.label}</span>
              <span className="text-xs text-slate-400">
                {rated}/{g.fields.length}
                <span className="ml-2 inline-block">{open ? "▲" : "▼"}</span>
              </span>
            </button>
            {open && (
              <div className="divide-y divide-slate-100 border-t border-slate-200 px-4 py-1 dark:divide-slate-800 dark:border-slate-800">
                {g.fields.map(([field, label]) => (
                  <StarInput
                    key={field}
                    label={label}
                    value={ratings[field]}
                    onChange={(v) =>
                      setRatings((r) => {
                        const next = { ...r };
                        if (v === undefined) delete next[field];
                        else next[field] = v;
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}

      <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:static md:px-0">
        <Button
          className="w-full shadow-lg"
          disabled={ratedCount === 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : `Save evaluation${ratedCount ? ` (${ratedCount} rated)` : ""}`}
        </Button>
        {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
      </div>
    </div>
  );
}
