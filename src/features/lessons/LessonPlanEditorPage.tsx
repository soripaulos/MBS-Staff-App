import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, CircleDashed, CircleDot, Plus, Trash2 } from "lucide-react";
import { createDoc, getDoc, getList, updateDoc } from "@/lib/api";
import { formatDate, today } from "@/lib/dates";
import { useSession } from "@/providers/SessionProvider";
import { useMyGroups } from "@/features/shared/useGroups";
import type { CourseScheduleRow, LessonPlanObjective, LessonPlanRow } from "@/lib/types";
import { NothingToCarry, carryForward, objectivesToCarry, type CarryResult } from "./carryForward";
import { Badge, Button, Card, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea } from "@/components/ui";
import { cn, round1 } from "@/lib/utils";

/**
 * Write a plan before the lesson; mark it off after.
 *
 * The objectives table carries the whole idea: each one has an outcome, and
 * the ones that didn't land can be pushed onto the next lesson without
 * retyping them. Coverage is computed server-side from the outcomes, so the
 * number a head of department sees is the same one the teacher recorded.
 */

const OUTCOMES: { key: LessonPlanObjective["outcome"]; label: string; icon: typeof Check; cls: string }[] = [
  { key: "Not started", label: "Not started", icon: CircleDashed, cls: "text-slate-400" },
  { key: "Partially achieved", label: "Partly", icon: CircleDot, cls: "text-amber-500" },
  { key: "Achieved", label: "Achieved", icon: Check, cls: "text-emerald-600" },
];

const STATUSES: LessonPlanRow["status"][] = ["Planned", "Taught", "Partially taught", "Not taught", "Carried forward"];

type Draft = Omit<LessonPlanRow, "name" | "coverage"> & { name?: string };

const blank = (): Draft => ({
  title: "",
  course: "",
  student_group: "",
  plan_date: today(),
  status: "Planned",
  objectives: [],
});

export default function LessonPlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const scheduleId = params.get("schedule");
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
  const { groups } = useMyGroups();

  const [draft, setDraft] = useState<Draft>(blank);
  const [loaded, setLoaded] = useState(false);
  const [carryOpen, setCarryOpen] = useState(false);
  const [carried, setCarried] = useState<CarryResult | null>(null);

  const existing = useQuery({
    queryKey: ["lesson-plan", id],
    enabled: !isNew,
    queryFn: () => getDoc<LessonPlanRow>("Lesson Plan", id!),
  });

  /** Creating from a timetabled lesson pre-fills subject, section and date. */
  const schedule = useQuery({
    queryKey: ["lesson-schedule", scheduleId],
    enabled: isNew && !!scheduleId,
    queryFn: () => getDoc<CourseScheduleRow>("Course Schedule", scheduleId!),
  });

  useEffect(() => {
    if (loaded) return;
    if (!isNew && existing.data) {
      setDraft({ ...existing.data, objectives: existing.data.objectives ?? [] });
      setLoaded(true);
    } else if (isNew && scheduleId && schedule.data) {
      setDraft({
        ...blank(),
        course: schedule.data.course,
        student_group: schedule.data.student_group,
        instructor: schedule.data.instructor ?? session.instructor?.name ?? null,
        plan_date: schedule.data.schedule_date,
        course_schedule: schedule.data.name,
      });
      setLoaded(true);
    } else if (isNew && !scheduleId) {
      setDraft({ ...blank(), instructor: session.instructor?.name ?? null, student_group: groups[0]?.name ?? "" });
      setLoaded(true);
    }
  }, [isNew, scheduleId, existing.data, schedule.data, loaded, session.instructor, groups]);

  /** Subjects this teacher actually takes in the chosen section. */
  const subjects = useMemo(() => {
    const taught = session.subjectPairs.filter((p) => p.student_group === draft.student_group).map((p) => p.course);
    const all = [...new Set([...taught, ...(draft.course ? [draft.course] : [])])].sort();
    return all;
  }, [session.subjectPairs, draft.student_group, draft.course]);

  const prior = useQuery({
    queryKey: ["lesson-prior", draft.student_group, draft.course, draft.plan_date],
    enabled: !!draft.student_group && !!draft.course,
    queryFn: () =>
      getList<LessonPlanRow>("Lesson Plan", {
        filters: [
          ["student_group", "=", draft.student_group],
          ["course", "=", draft.course],
          ["plan_date", "<", draft.plan_date],
        ] as never,
        fields: ["name", "title", "plan_date", "status", "coverage", "unit", "topic"],
        orderBy: "plan_date desc",
        limit: 3,
      }).catch(() => [] as LessonPlanRow[]),
  });

  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setObjective = (i: number, patch: Partial<LessonPlanObjective>) =>
    setDraft((d) => ({
      ...d,
      objectives: (d.objectives ?? []).map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: draft.title,
        course: draft.course,
        student_group: draft.student_group,
        instructor: draft.instructor ?? session.instructor?.name ?? null,
        plan_date: draft.plan_date,
        course_schedule: draft.course_schedule ?? null,
        status: draft.status,
        unit: draft.unit ?? "",
        topic: draft.topic ?? "",
        teaching_method: draft.teaching_method ?? "",
        activities: draft.activities ?? "",
        materials: draft.materials ?? "",
        assessment: draft.assessment ?? "",
        homework: draft.homework ?? "",
        reflection: draft.reflection ?? "",
        objectives: (draft.objectives ?? []).filter((o) => o.objective.trim()),
      };
      if (isNew) return createDoc<{ name: string }>("Lesson Plan", payload);
      await updateDoc("Lesson Plan", id!, payload);
      return { name: id! };
    },
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ["lesson-plans"] });
      void qc.invalidateQueries({ queryKey: ["lesson-week"] });
      void qc.invalidateQueries({ queryKey: ["lesson-plan", doc.name] });
      if (isNew) navigate(`/lessons/${encodeURIComponent(doc.name)}`, { replace: true });
    },
  });

  const carry = useMutation({
    mutationFn: async () => {
      // Save first, so the objectives being carried are the ones on screen.
      await save.mutateAsync();
      const full = await getDoc<LessonPlanRow>("Lesson Plan", id!);
      return carryForward(full);
    },
    onSuccess: (res) => {
      setCarried(res);
      setCarryOpen(false);
      void qc.invalidateQueries({ queryKey: ["lesson-plan", id] });
      void qc.invalidateQueries({ queryKey: ["lesson-plans"] });
      void qc.invalidateQueries({ queryKey: ["lesson-week"] });
    },
  });

  if (!isNew && existing.isLoading) return <ListSkeleton rows={6} />;
  if (!isNew && existing.isError) return <ErrorState error={existing.error} retry={() => existing.refetch()} />;

  const objectives = draft.objectives ?? [];
  const achieved = objectives.filter((o) => o.outcome === "Achieved").length;
  const partial = objectives.filter((o) => o.outcome === "Partially achieved").length;
  const coverage = objectives.length ? ((achieved + partial * 0.5) / objectives.length) * 100 : 0;
  const pending = objectivesToCarry({ ...draft, name: id ?? "" } as LessonPlanRow);
  const alreadyCarried = !!existing.data?.carried_to;

  return (
    <div className="mx-auto max-w-2xl pb-28 md:pb-6">
      <Link to="/lessons" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-300">
        <ArrowLeft size={16} /> Lesson plans
      </Link>
      <PageTitle
        title={isNew ? "New lesson plan" : draft.title || "Lesson plan"}
        subtitle={draft.course && draft.student_group ? `${draft.course} · ${draft.student_group} · ${formatDate(draft.plan_date)}` : undefined}
      />

      {existing.data?.carried_from && (
        <Card className="mb-3 flex items-center gap-2 border-sky-300 bg-sky-50 py-2.5 dark:border-sky-800 dark:bg-sky-950/40">
          <ArrowRight size={16} className="shrink-0 text-sky-600" />
          <p className="min-w-0 flex-1 text-xs text-sky-900 dark:text-sky-200">
            Objectives on this plan were carried over from an earlier lesson.
          </p>
          <Link
            to={`/lessons/${encodeURIComponent(existing.data.carried_from)}`}
            className="shrink-0 text-xs font-medium text-sky-700 dark:text-sky-300"
          >
            Open it →
          </Link>
        </Card>
      )}
      {alreadyCarried && (
        <Card className="mb-3 flex items-center gap-2 py-2.5">
          <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
            What was left of this plan has already been carried forward.
          </p>
          <Link
            to={`/lessons/${encodeURIComponent(existing.data!.carried_to!)}`}
            className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-300"
          >
            Open it →
          </Link>
        </Card>
      )}

      <Card className="mb-3 space-y-3">
        <div>
          <Label>Lesson title</Label>
          <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Equivalent fractions" required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Section</Label>
            <Select value={draft.student_group} onChange={(e) => set("student_group", e.target.value)}>
              <option value="">Select…</option>
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.student_group_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            {subjects.length ? (
              <Select value={draft.course} onChange={(e) => set("course", e.target.value)}>
                <option value="">Select…</option>
                {subjects.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            ) : (
              <Input value={draft.course} onChange={(e) => set("course", e.target.value)} placeholder="Subject" />
            )}
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={draft.plan_date} onChange={(e) => set("plan_date", e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={draft.status} onChange={(e) => set("status", e.target.value as LessonPlanRow["status"])}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Unit / chapter</Label>
            <Input value={draft.unit ?? ""} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. Unit 3 — Fractions" />
          </div>
          <div>
            <Label>Topic</Label>
            <Input value={draft.topic ?? ""} onChange={(e) => set("topic", e.target.value)} />
          </div>
        </div>
      </Card>

      {!!prior.data?.length && (
        <Card className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Last lessons here</p>
          <ul className="space-y-1 text-xs">
            {prior.data.map((p) => (
              <li key={p.name} className="flex items-center gap-2">
                <Link to={`/lessons/${encodeURIComponent(p.name)}`} className="min-w-0 flex-1 truncate hover:text-brand-600">
                  {formatDate(p.plan_date)} · {p.title}
                </Link>
                <span className="shrink-0 text-slate-400">
                  {p.status}
                  {typeof p.coverage === "number" && p.status !== "Planned" ? ` · ${round1(p.coverage)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Learning objectives</h2>
            <p className="text-xs text-slate-400">
              {objectives.length
                ? `${achieved} achieved, ${partial} partly — ${round1(coverage)}% covered`
                : "What students should be able to do by the end"}
            </p>
          </div>
          <Button
            variant="secondary"
            className="min-h-0 px-3 py-1.5 text-xs"
            onClick={() => set("objectives", [...objectives, { objective: "", outcome: "Not started", carry_forward: 0 }])}
          >
            <Plus size={14} /> Add
          </Button>
        </div>
        {!objectives.length ? (
          <p className="py-3 text-sm text-slate-400">No objectives yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {objectives.map((o, i) => (
              <li key={i} className="space-y-2 py-2.5">
                <div className="flex items-start gap-2">
                  <Textarea
                    rows={2}
                    className="flex-1"
                    value={o.objective}
                    onChange={(e) => setObjective(i, { objective: e.target.value })}
                    placeholder="Students can…"
                  />
                  <button
                    onClick={() => set("objectives", objectives.filter((_, idx) => idx !== i))}
                    aria-label="Remove objective"
                    className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {OUTCOMES.map((out) => {
                    const Icon = out.icon;
                    const on = o.outcome === out.key;
                    return (
                      <button
                        key={out.key}
                        onClick={() => setObjective(i, { outcome: out.key, ...(out.key === "Achieved" ? { carry_forward: 0 } : {}) })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                          on
                            ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                            : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
                        )}
                      >
                        <Icon size={13} className={on ? out.cls : ""} /> {out.label}
                      </button>
                    );
                  })}
                  {o.outcome !== "Achieved" && (
                    <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!!o.carry_forward}
                        onChange={(e) => setObjective(i, { carry_forward: e.target.checked ? 1 : 0 })}
                      />
                      Carry forward
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-3 space-y-3">
        <h2 className="text-sm font-semibold">Delivery</h2>
        {(
          [
            ["teaching_method", "Teaching method", "How you will teach it"],
            ["activities", "Classroom activities", "What students will do"],
            ["materials", "Materials & resources", "Books, pages, equipment"],
            ["assessment", "Check for understanding", "How you will know it landed"],
            ["homework", "Homework", ""],
          ] as const
        ).map(([key, label, hint]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Textarea rows={2} value={(draft[key] as string) ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={hint} />
          </div>
        ))}
      </Card>

      <Card className="mb-3 space-y-3">
        <h2 className="text-sm font-semibold">After the lesson</h2>
        <div>
          <Label>Reflection</Label>
          <Textarea
            rows={3}
            value={draft.reflection ?? ""}
            onChange={(e) => set("reflection", e.target.value)}
            placeholder="What actually happened, and why anything was left uncovered."
          />
        </div>
        {!isNew && (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Carry the rest forward</p>
                <p className="text-xs text-slate-500">
                  {alreadyCarried
                    ? "Already done for this plan."
                    : pending.length
                      ? `${pending.length} objective${pending.length === 1 ? "" : "s"} would move to the next lesson for this section.`
                      : "Nothing outstanding — every objective is achieved."}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={alreadyCarried || !pending.length || carry.isPending}
                onClick={() => setCarryOpen(true)}
              >
                <ArrowRight size={16} /> Carry forward
              </Button>
            </div>
            {carried && (
              <p className="mt-2 text-xs text-emerald-600">
                {carried.moved} objective{carried.moved === 1 ? "" : "s"} moved to{" "}
                <Link to={`/lessons/${encodeURIComponent(carried.target)}`} className="underline">
                  {carried.created ? "a new plan" : "the existing plan"}
                </Link>{" "}
                on {formatDate(carried.targetDate)}
                {carried.scheduled ? "." : " — no timetabled lesson was found, so it was placed on the next school day."}
              </p>
            )}
            {carry.isError && (
              <p className="mt-2 text-xs text-red-600">
                {carry.error instanceof NothingToCarry ? carry.error.message : (carry.error as Error).message}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="fixed inset-x-0 bottom-16 z-30 px-4 md:static md:px-0">
        <Button
          className="w-full shadow-lg"
          disabled={save.isPending || !draft.title.trim() || !draft.course || !draft.student_group}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : isNew ? "Create plan" : "Save plan"}
        </Button>
        {save.isError && <p className="mt-2 text-center text-sm text-red-600">{(save.error as Error).message}</p>}
        {save.isSuccess && !isNew && !carry.isPending && (
          <p className="mt-2 text-center text-sm text-emerald-600">Saved.</p>
        )}
      </div>

      <Modal open={carryOpen} onClose={() => setCarryOpen(false)} title="Carry forward">
        <div className="space-y-3 text-sm">
          <p>These objectives will move to the next lesson for this section and subject:</p>
          <ul className="space-y-1">
            {pending.map((o, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800">
                <Badge tone={o.outcome === "Partially achieved" ? "amber" : "slate"}>{o.outcome}</Badge>
                <span className="min-w-0 flex-1">{o.objective}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            If a plan already exists for that lesson they are added to it; otherwise a new plan is created. If the
            timetable has nothing ahead for this section, they land on the next school day and you can move them.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCarryOpen(false)}>
              Cancel
            </Button>
            <Button disabled={carry.isPending} onClick={() => carry.mutate()}>
              {carry.isPending ? "Moving…" : "Carry forward"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
