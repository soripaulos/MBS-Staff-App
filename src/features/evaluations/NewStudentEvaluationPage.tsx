import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star } from "lucide-react";
import { createDoc, getDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useGroupSubjects, useMyGroups } from "@/features/shared/useGroups";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { StudentDoc } from "@/lib/types";
import { Button, Card, ErrorState, Label, ListSkeleton, PageTitle, Select, Textarea } from "@/components/ui";

/**
 * Create a `Student Evaluation` — the termly read a teacher gives on a
 * student, which the parents see in the student app's hub.
 *
 * Frappe Rating fields store 0..1; the UI is five stars, so every value is
 * written as stars / 5. Unrated criteria are left out of the payload entirely
 * rather than sent as zero, so "not assessed" stays distinct from "rated zero".
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
      ["proficiency", "Overall proficiency"],
      ["tests", "Tests"],
      ["homework", "Homework"],
    ],
  },
  {
    label: "Skills",
    fields: [
      ["critical_thinking", "Critical thinking"],
      ["creativity", "Creativity"],
      ["speaking_and_communication_skills", "Speaking & communication"],
      ["digital_literacy", "Digital literacy"],
      ["extracurricular", "Extracurricular"],
      ["sports", "Sports"],
    ],
  },
  {
    label: "Habits & conduct",
    fields: [
      ["engagement", "Engagement"],
      ["participation", "Participation"],
      ["assignment_responsibility", "Assignment responsibility"],
      ["organization", "Organization"],
      ["attendance", "Attendance"],
      ["discipline", "Discipline"],
      ["communicationpeer_relationships", "Peer relationships"],
      ["respect", "Respect"],
      ["leadership", "Leadership"],
      ["emotional_regulation", "Emotional regulation"],
      ["hygiene", "Hygiene"],
    ],
  },
];

const FLAGS: [string, string][] = [
  ["breaking_rules", "Breaking rules"],
  ["fight", "Fighting"],
  ["incomplete_school_items", "Incomplete school items"],
  ["homework_not_done", "Homework not done"],
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
  const { groups } = useMyGroups();

  const student = useQuery({
    queryKey: ["student", id],
    enabled: !!id,
    queryFn: () => getDoc<StudentDoc>("Student", id!),
  });

  const [group, setGroup] = useState<string | null>(null);
  const effectiveGroup = group ?? groups[0]?.name ?? null;
  const { subjects } = useGroupSubjects(effectiveGroup);
  const [course, setCourse] = useState<string | null>(null);
  const effectiveCourse = course && subjects.includes(course) ? course : subjects[0] ?? null;

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [achievements, setAchievements] = useState("");
  const [feedback, setFeedback] = useState("");
  const [openSection, setOpenSection] = useState<string>(GROUPS[0].label);

  const ratedCount = Object.keys(ratings).length;
  const totalCriteria = useMemo(() => GROUPS.reduce((a, g) => a + g.fields.length, 0), []);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        students: id,
        student_group: effectiveGroup,
        class: effectiveCourse,
        review_date: today(),
        achievements,
        feedback,
      };
      // Rating fields are 0..1 on the server.
      for (const [field, stars] of Object.entries(ratings)) payload[field] = stars / 5;
      for (const [field, on] of Object.entries(flags)) if (on) payload[field] = 1;
      return createDoc("Student Evaluation", payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student-evals", id] });
      navigate(`/students/${encodeURIComponent(id!)}?tab=evaluations`, { replace: true });
    },
  });

  if (student.isLoading) return <ListSkeleton rows={6} />;
  if (student.isError) return <ErrorState error={student.error} retry={() => student.refetch()} />;

  const displayName = student.data?.student_name ?? id;
  const canSubmit = !!effectiveGroup && !!effectiveCourse && ratedCount > 0 && !save.isPending;

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-6">
      <Link
        to={`/students/${encodeURIComponent(id!)}?tab=evaluations`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300"
      >
        <ArrowLeft size={16} /> {displayName}
      </Link>
      <PageTitle title="New evaluation" subtitle={`${displayName} · ${ratedCount} of ${totalCriteria} criteria rated`} />

      <Card className="mb-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Section</Label>
            <Select
              value={effectiveGroup ?? ""}
              onChange={(e) => {
                setGroup(e.target.value);
                setCourse(null);
              }}
            >
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.student_group_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={effectiveCourse ?? ""} onChange={(e) => setCourse(e.target.value)}>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        </div>
        {!subjects.length && (
          <p className="text-xs text-amber-600">
            No subjects resolved for this section, so this evaluation can't be filed yet.
          </p>
        )}
        <p className="text-xs text-slate-400">
          Filed as {session.instructor?.instructor_name ?? user}. Parents see this in the student app.
        </p>
      </Card>

      {/* Rating groups as accordions — 26 criteria is far too long to scroll
          through on a phone in one list. */}
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

      <Card className="mb-2">
        <h3 className="mb-2 text-sm font-semibold">Concerns</h3>
        <div className="grid grid-cols-2 gap-2">
          {FLAGS.map(([field, label]) => (
            <label
              key={field}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm",
                flags[field]
                  ? "border-red-400 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                  : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300",
              )}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={!!flags[field]}
                onChange={(e) => setFlags((f) => ({ ...f, [field]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="mb-2 space-y-3">
        <div>
          <Label>Achievements</Label>
          <Textarea rows={2} value={achievements} onChange={(e) => setAchievements(e.target.value)} />
        </div>
        <div>
          <Label>Feedback to parents</Label>
          <Textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:static md:px-0">
        <Button className="w-full shadow-lg" disabled={!canSubmit} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : `Save evaluation${ratedCount ? ` (${ratedCount} rated)` : ""}`}
        </Button>
        {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
      </div>
    </div>
  );
}
