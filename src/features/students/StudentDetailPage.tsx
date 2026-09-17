import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus, Trophy } from "lucide-react";
import { createDoc, fileUrl, getDoc, getList } from "@/lib/api";
import { formatDate, today } from "@/lib/dates";
import { cn, initials, ratingToStars, stripHtml } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import type { StudentDoc } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Stars, Tabs, Textarea, statusTone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* timeline                                                            */
/* ------------------------------------------------------------------ */

interface TimelineItem {
  kind: string;
  date: string;
  title: string;
  detail?: string;
  badge?: string;
  badgeTone?: "slate" | "green" | "amber" | "red" | "blue";
}

function useTimeline(student: string) {
  return useQuery({
    queryKey: ["student-timeline", student],
    queryFn: async () => {
      const items: TimelineItem[] = [];
      const safe = async <T,>(fn: () => Promise<T[]>): Promise<T[]> => {
        try {
          return await fn();
        } catch {
          return [];
        }
      };
      const [activities, incidents, discipline, lates, sicks, permissions] = await Promise.all([
        safe(() =>
          getList<{ activity_type?: string; activity_date?: string; title?: string; role?: string; description?: string }>("Student Activity", {
            filters: [["student", "=", student]],
            fields: ["activity_type", "activity_date", "title", "role", "description"],
            orderBy: "activity_date desc",
            limit: 50,
          }),
        ),
        safe(() =>
          getList<{ incident_date: string; incident_type?: string; status?: string; description?: string }>("Student Incident", {
            filters: [["student", "=", student]],
            fields: ["incident_date", "incident_type", "status", "description"],
            orderBy: "incident_date desc",
            limit: 50,
          }),
        ),
        safe(() =>
          getList<{ incident_date: string; incident_type?: string; severity?: string; status?: string; description?: string }>(
            "Student Discipline Incident",
            {
              filters: [["student", "=", student]],
              fields: ["incident_date", "incident_type", "severity", "status", "description"],
              orderBy: "incident_date desc",
              limit: 50,
            },
          ),
        ),
        safe(() =>
          getList<{ date: string; reason?: string }>("Student Late Record", {
            filters: [["student", "=", student], ["docstatus", "!=", 2]],
            fields: ["date", "reason"],
            orderBy: "date desc",
            limit: 50,
          }),
        ),
        safe(() =>
          getList<{ date: string; type?: string; details?: string }>("Student Sick Record", {
            filters: [["student", "=", student], ["docstatus", "!=", 2]],
            fields: ["date", "type", "details"],
            orderBy: "date desc",
            limit: 50,
          }),
        ),
        safe(() =>
          getList<{ date: string; reason?: string; detail?: string }>("Student Permission Leave", {
            filters: [["student", "=", student], ["docstatus", "!=", 2]],
            fields: ["date", "reason", "detail"],
            orderBy: "date desc",
            limit: 50,
          }),
        ),
      ]);

      for (const a of activities)
        items.push({
          kind: "Activity",
          date: a.activity_date ?? "",
          title: `${a.activity_type ?? "Activity"}: ${a.title ?? ""}`,
          detail: [a.role, stripHtml(a.description)].filter(Boolean).join(" — "),
          badge: a.activity_type,
          badgeTone: a.activity_type === "Achievement" ? "green" : "blue",
        });
      for (const i of incidents)
        items.push({
          kind: "Incident",
          date: i.incident_date,
          title: `${i.incident_type ?? "Incident"}`,
          detail: stripHtml(i.description),
          badge: i.status,
          badgeTone: statusTone(i.status),
        });
      for (const i of discipline)
        items.push({
          kind: "Incident",
          date: i.incident_date,
          title: `Discipline · ${i.incident_type ?? ""}${i.severity ? ` (${i.severity})` : ""}`,
          detail: stripHtml(i.description),
          badge: i.status,
          badgeTone: statusTone(i.status),
        });
      for (const l of lates) items.push({ kind: "Late", date: l.date, title: "Late arrival", detail: l.reason, badge: "Late", badgeTone: "amber" });
      for (const s of sicks)
        items.push({ kind: "Sick", date: s.date, title: `Sick — ${s.type ?? ""}`, detail: s.details, badge: "Sick", badgeTone: "red" });
      for (const p of permissions)
        items.push({ kind: "Leave", date: p.date, title: `Permission — ${p.reason ?? ""}`, detail: p.detail, badge: "Leave", badgeTone: "blue" });

      return items.filter((i) => i.date).sort((a, b) => b.date.localeCompare(a.date));
    },
  });
}

const TIMELINE_FILTERS = ["All", "Achievement", "Activity", "Incident", "Late", "Sick", "Leave"];

function TimelineTab({ student }: { student: string }) {
  const q = useTimeline(student);
  const [filter, setFilter] = useState("All");
  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const items = (q.data ?? []).filter((i) => filter === "All" || i.kind.startsWith(filter));
  return (
    <div className="space-y-3">
      <div className="scroll-thin flex gap-1 overflow-x-auto">
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? "whitespace-nowrap rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
                : "whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }
          >
            {f}
          </button>
        ))}
      </div>
      {!items.length ? (
        <EmptyState title="Nothing here yet" hint="Activities, achievements, incidents and attendance events will appear here." icon={<Trophy size={40} />} />
      ) : (
        <ul className="space-y-2">
          {items.map((i, idx) => (
            <li key={idx}>
              <Card className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{i.title}</p>
                  {i.detail && <p className="mt-0.5 line-clamp-3 text-xs text-slate-500">{i.detail}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-slate-400">{formatDate(i.date)}</span>
                  {i.badge && <Badge tone={i.badgeTone ?? "slate"}>{i.badge}</Badge>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* add log / activity                                                  */
/* ------------------------------------------------------------------ */

function AddRecordModal({ student, open, onClose }: { student: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [kind, setKind] = useState<"Activity" | "Incident">("Activity");
  const [date, setDate] = useState(today());

  // Student Activity
  const [activityType, setActivityType] = useState("Achievement");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");

  // Student Discipline Incident
  const [incidentType, setIncidentType] = useState("Incident");
  const [severity, setSeverity] = useState("Low");

  const [text, setText] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      if (kind === "Activity") {
        await createDoc("Student Activity", {
          student,
          activity_type: activityType,
          activity_date: date,
          title,
          role,
          description: text,
          reported_by: user,
        });
      } else {
        await createDoc("Student Discipline Incident", {
          student,
          incident_date: date,
          incident_type: incidentType,
          severity,
          status: "Open",
          description: text,
          reported_by: user,
        });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student-timeline", student] });
      onClose();
      setText("");
      setTitle("");
      setRole("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Add record">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div>
          <Label>What are you recording?</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["Activity", "Incident"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "min-h-[44px] rounded-lg border px-3 text-sm font-medium",
                  kind === k
                    ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
                    : "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300",
                )}
              >
                {k === "Activity" ? "Activity / achievement" : "Discipline incident"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {kind === "Activity" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
                  {["Club", "Sport", "Volunteer", "Achievement", "Note"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Role (optional)</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Team Lead" />
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Robotics Club" required />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={incidentType} onChange={(e) => setIncidentType(e.target.value)}>
                {["Academic", "Incident", "Disciplinary", "Other"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {["Low", "Medium", "High"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <div>
          <Label>{kind === "Activity" ? "Details" : "What happened"}</Label>
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} required />
        </div>
        {kind === "Incident" && (
          <p className="text-xs text-slate-400">
            Opens as an incident for follow-up. Parents may respond, and it stays Open until a resolution is recorded.
          </p>
        )}
        <Button type="submit" className="w-full" disabled={m.isPending}>
          {m.isPending ? "Saving…" : "Save record"}
        </Button>
        {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* evaluations tab                                                     */
/* ------------------------------------------------------------------ */

const EVAL_GROUPS: { label: string; fields: [string, string][] }[] = [
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
      ["speaking_and_communication_skills", "Communication"],
      ["digital_literacy", "Digital literacy"],
    ],
  },
  {
    label: "Habits & conduct",
    fields: [
      ["engagement", "Engagement"],
      ["assignment_responsibility", "Assignments"],
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

function EvaluationsTab({ student, canCreate }: { student: string; canCreate: boolean }) {
  const q = useQuery({
    queryKey: ["student-evals", student],
    queryFn: async () => {
      const fields = [
        "name",
        "review_date",
        "reviewer_name",
        "status",
        "parent_response",
        ...EVAL_GROUPS.flatMap((g) => g.fields.map((f) => f[0])),
      ];
      try {
        return await getList<Record<string, unknown>>("Student Hub Evaluation", {
          filters: [["student", "=", student]],
          fields,
          orderBy: "review_date desc",
          limit: 20,
        });
      } catch {
        return [];
      }
    },
  });
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);

  const newLink = (
    <Link
      to={`/students/${encodeURIComponent(student)}/evaluate`}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"
    >
      <Plus size={16} /> New evaluation
    </Link>
  );

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (!q.data?.length)
    return (
      <div className="space-y-4">
        <EmptyState title="No evaluations yet" hint="Evaluations you write appear here and in the parents' app." />
        {canCreate && <div className="flex justify-center">{newLink}</div>}
      </div>
    );
  return (
    <div className="space-y-2">
      {canCreate && <div className="flex justify-end">{newLink}</div>}
      {q.data.map((e) => (
        <button key={String(e.name)} className="w-full text-left" onClick={() => setOpen(e)}>
          <Card className="flex items-center gap-3 hover:shadow-md">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{formatDate(String(e.review_date ?? ""))}</p>
              <p className="truncate text-xs text-slate-500">
                {String(e.reviewer_name ?? "—")}
                {e.parent_response ? ` · parent replied` : ""}
              </p>
            </div>
            {!!e.status && <Badge tone={statusTone(String(e.status))}>{String(e.status)}</Badge>}
          </Card>
        </button>
      ))}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Evaluation" wide>
        {open && (
          <div className="space-y-4">
            {EVAL_GROUPS.map((g) => {
              const rated = g.fields.filter(([f]) => typeof open[f] === "number" && (open[f] as number) > 0);
              if (!rated.length) return null;
              return (
                <div key={g.label}>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{g.label}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {rated.map(([f, label]) => (
                      <div key={f} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">{label}</span>
                        <Stars value={ratingToStars(open[f] as number)} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!!open.parent_response && (
              <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
                <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Parent replied</p>
                {stripHtml(String(open.parent_response))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery({
    queryKey: ["student", id],
    enabled: !!id,
    queryFn: () => getDoc<StudentDoc>("Student", id!),
  });

  const tabs = useMemo(
    () => [
      { key: "overview", label: "Overview" },
      { key: "timeline", label: "Records" },
      { key: "evaluations", label: "Evaluations" },
    ],
    [],
  );

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data!;
  const displayName = s.student_name ?? `${s.first_name ?? ""}`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        {s.image ? (
          <img src={fileUrl(s.image)} alt="" className="h-16 w-16 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
            {initials(displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <PageTitle title={displayName ?? id!} subtitle={`${s.custom_school_id ?? s.name}${s.gender ? ` · ${s.gender}` : ""}`} />
        </div>
        <Link
          to={`/results/student/${encodeURIComponent(id!)}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <GraduationCap size={16} /> Results
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
        {tab === "timeline" && (session.isTeacher || session.isLeadership) && (
          <Button variant="secondary" className="min-h-0 px-3 py-1.5 text-xs" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add
          </Button>
        )}
      </div>

      {tab === "overview" && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold">Profile</h3>
            <dl className="space-y-1.5 text-sm">
              {[
                ["School ID", s.custom_school_id],
                ["Government ID", s.custom_government_student_id],
                ["Date of birth", formatDate(s.date_of_birth)],
                ["Joined", formatDate(s.joining_date)],
                ["Category", s.custom_student_category],
                ["Transport", s.custom_mode_of_transport],
                ["Email", s.student_email_id],
              ]
                .filter(([, v]) => v && v !== "—")
                .map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-4">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
            </dl>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold">Guardians</h3>
            {s.guardians?.length ? (
              <ul className="space-y-2 text-sm">
                {s.guardians.map((g, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="font-medium">{g.guardian_name ?? g.guardian}</span>
                    <span className="text-slate-500">{g.relation ?? ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No guardians recorded.</p>
            )}
          </Card>
        </div>
      )}
      {tab === "timeline" && id && <TimelineTab student={id} />}
      {tab === "evaluations" && id && (
        <EvaluationsTab student={id} canCreate={session.isTeacher || session.isLeadership} />
      )}

      {id && <AddRecordModal student={id} open={addOpen} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
