import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Info, Plus } from "lucide-react";
import { createDoc, fileUrl, getList, submitDoc, updateDoc } from "@/lib/api";
import { formatDate, formatTime, today, ymd, addDays } from "@/lib/dates";
import { PERMISSION_REASONS, SICK_ACTIONS, SICK_TYPES } from "@/lib/constants";
import { useAcademic } from "@/providers/AcademicProvider";
import { useSession } from "@/providers/SessionProvider";
import { useGroupStudents, useMyGroups } from "@/features/shared/useGroups";
import { useStudentNames } from "@/features/shared/useStudentNames";
import type { StudentLeaveRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Tabs, Textarea, statusTone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

function useDateRange() {
  const [from, setFrom] = useState(() => ymd(addDays(new Date(), -30)));
  const [to, setTo] = useState(today());
  return { from, to, setFrom, setTo };
}

function RangeInputs({ range }: { range: ReturnType<typeof useDateRange> }) {
  return (
    <div className="flex items-center gap-2">
      <Input type="date" className="max-w-40" value={range.from} onChange={(e) => range.setFrom(e.target.value)} aria-label="From date" />
      <span className="text-slate-400">–</span>
      <Input type="date" className="max-w-40" value={range.to} onChange={(e) => range.setTo(e.target.value)} aria-label="To date" />
    </div>
  );
}

function StudentField({
  group,
  setGroup,
  student,
  setStudent,
}: {
  group: string | null;
  setGroup: (g: string) => void;
  student: string;
  setStudent: (s: string) => void;
}) {
  const session = useSession();
  const { groups: allGroups } = useMyGroups();
  // Only sections this user may actually file records for: their homeroom
  // groups, or everything for leadership.
  const groups = session.isLeadership ? allGroups : session.homeroomGroups;
  const effective = group ?? groups[0]?.name ?? null;
  const students = useGroupStudents(effective);
  return (
    <>
      <div>
        <Label>Section</Label>
        <Select value={effective ?? ""} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.student_group_name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Student</Label>
        <Select value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">Select student…</option>
          {(students.data ?? []).map((s) => (
            <option key={s.student} value={s.student}>
              {s.group_roll_number ? `${s.group_roll_number}. ` : ""}
              {s.student_name}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}

/** Generic record list — fetches rows, shows student/date/details, restricted for teachers to their students. */
function RecordList<T extends { name: string; student: string; date?: string }>({
  doctype,
  fields,
  range,
  render,
  emptyHint,
}: {
  doctype: string;
  fields: string[];
  range: { from: string; to: string };
  render: (row: T, studentName: (id: string) => string) => ReactNode;
  emptyHint: string;
}) {
  const q = useQuery({
    queryKey: [doctype, range.from, range.to],
    queryFn: () =>
      getList<T>(doctype, {
        filters: [["date", "between", [range.from, range.to]], ["docstatus", "!=", 2]] as never,
        fields,
        orderBy: "date desc",
        limit: 500,
      }),
  });

  // Rows are already scoped to the caller's own sections by the server-side
  // permission queries, so there is no client-side filtering to do — only
  // names to resolve, since the records carry bare student IDs.
  const { nameOf } = useStudentNames((q.data ?? []).map((r) => r.student));

  if (q.isLoading) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const rows = q.data ?? [];
  if (!rows.length) return <EmptyState title="No records" hint={emptyHint} />;
  return <div className="space-y-2">{rows.map((r) => render(r, nameOf))}</div>;
}

/* ------------------------------------------------------------------ */
/* create-record modal forms                                           */
/* ------------------------------------------------------------------ */

function useCreateSubmit(doctype: string, invalidate: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Record<string, unknown>) => {
      const created = await createDoc<Record<string, unknown>>(doctype, doc);
      try {
        await submitDoc(created);
      } catch {
        /* left as draft when submit isn't permitted */
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [invalidate] }),
  });
}

function LateForm({ onDone }: { onDone: () => void }) {
  const [group, setGroup] = useState<string | null>(null);
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [reason, setReason] = useState("");
  const m = useCreateSubmit("Student Late Record", "Student Late Record");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ student, date, time: `${time}:00`, reason }, { onSuccess: onDone });
      }}
    >
      <StudentField group={group} setGroup={setGroup} student={student} setStudent={setStudent} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <Label>Arrival time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label>Reason</Label>
        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why was the student late?" />
      </div>
      <Button type="submit" className="w-full" disabled={!student || m.isPending}>
        {m.isPending ? "Saving…" : "Log late arrival"}
      </Button>
      {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
    </form>
  );
}

function SickForm({ onDone }: { onDone: () => void }) {
  const [group, setGroup] = useState<string | null>(null);
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(today());
  const [type, setType] = useState<string>(SICK_TYPES[0]);
  const [details, setDetails] = useState("");
  const [parentContacted, setParentContacted] = useState(false);
  const [parentNotes, setParentNotes] = useState("");
  const [action, setAction] = useState<string>(SICK_ACTIONS[0]);
  const [leaveEarly, setLeaveEarly] = useState(false);
  const [leaveTime, setLeaveTime] = useState("12:00");
  const m = useCreateSubmit("Student Sick Record", "Student Sick Record");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(
          {
            student,
            date,
            type,
            details,
            parent_contacted: parentContacted ? 1 : 0,
            parent_notes: parentNotes,
            action,
            leave_early: leaveEarly ? 1 : 0,
            ...(leaveEarly ? { leave_time: `${leaveTime}:00` } : {}),
          },
          { onSuccess: onDone },
        );
      }}
    >
      <StudentField group={group} setGroup={setGroup} student={student} setStudent={setStudent} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <Label>Type</Label>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {SICK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label>Details</Label>
        <Textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <div>
        <Label>Action taken</Label>
        <Select value={action} onChange={(e) => setAction(e.target.value)}>
          {SICK_ACTIONS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={parentContacted} onChange={(e) => setParentContacted(e.target.checked)} className="h-4 w-4" />
        Parent contacted
      </label>
      {parentContacted && (
        <div>
          <Label>Parent notes</Label>
          <Textarea rows={2} value={parentNotes} onChange={(e) => setParentNotes(e.target.value)} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={leaveEarly} onChange={(e) => setLeaveEarly(e.target.checked)} className="h-4 w-4" />
        Student left school early
      </label>
      {leaveEarly && (
        <div>
          <Label>Leave time</Label>
          <Input type="time" value={leaveTime} onChange={(e) => setLeaveTime(e.target.value)} />
        </div>
      )}
      <Button type="submit" className="w-full" disabled={!student || m.isPending}>
        {m.isPending ? "Saving…" : "Log sick day"}
      </Button>
      {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
    </form>
  );
}

function PermissionForm({ onDone }: { onDone: () => void }) {
  const [group, setGroup] = useState<string | null>(null);
  const [student, setStudent] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [reason, setReason] = useState<string>(PERMISSION_REASONS[0]);
  const [detail, setDetail] = useState("");
  const m = useCreateSubmit("Student Permission Leave", "Student Permission Leave");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate({ student, date, time: `${time}:00`, reason, detail }, { onSuccess: onDone });
      }}
    >
      <StudentField group={group} setGroup={setGroup} student={student} setStudent={setStudent} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <Label>Time</Label>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>
      <div>
        <Label>Reason</Label>
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {PERMISSION_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Detail</Label>
        <Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={!student || m.isPending}>
        {m.isPending ? "Saving…" : "Record permission leave"}
      </Button>
      {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* student leave applications tab                                      */
/* ------------------------------------------------------------------ */

/**
 * Leave requests come from parents in the student app. The homeroom teacher of
 * the child's section decides them — the server enforces that, and also that
 * approving is the *only* thing a teacher may change on the request, so the
 * contents a parent submitted cannot be edited after the fact.
 */
function StudentLeaveTab() {
  const { term } = useAcademic();
  const session = useSession();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<StudentLeaveRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("Pending");

  const q = useQuery({
    queryKey: ["student-leave", term, statusFilter],
    queryFn: () =>
      getList<StudentLeaveRow>("Student Leave Application", {
        filters: (statusFilter === "All" ? [] : [["custom_status", "=", statusFilter]]) as never,
        fields: [
          "name", "student", "student_name", "student_group", "from_date", "to_date",
          "total_leave_days", "reason", "custom_status", "custom_supporting_document", "docstatus",
        ],
        orderBy: "from_date desc",
        limit: 200,
      }),
  });

  const decide = useMutation({
    mutationFn: ({ name, status }: { name: string; status: "Approved" | "Rejected" }) =>
      updateDoc("Student Leave Application", name, { custom_status: status }),
    onSuccess: () => {
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["student-leave"] });
    },
  });

  const canDecide = (r: StudentLeaveRow) => session.isLeadership || session.isHomeroomOf(r.student_group);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="max-w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
          {["Pending", "Approved", "Rejected", "All"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <p className="text-xs text-slate-500">Requests from parents for students in your sections</p>
      </div>
      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title={statusFilter === "Pending" ? "Nothing waiting on you" : "No leave applications"}
          hint="Student leave applications submitted from the student app appear here."
        />
      ) : (
        <div className="space-y-2">
          {q.data.map((r) => {
            const status = r.custom_status ?? "Pending";
            return (
              <button key={r.name} className="w-full text-left" onClick={() => setSelected(r)}>
                <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.student_name ?? r.student}</p>
                    <p className="truncate text-xs text-slate-500">
                      {formatDate(r.from_date)} → {formatDate(r.to_date)} ({r.total_leave_days ?? "?"} days)
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  {status === "Pending" && canDecide(r) && <Badge tone="brand">Needs you</Badge>}
                  <Badge tone={statusTone(status)}>{status}</Badge>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Leave request">
        {selected && (
          <div className="space-y-3 text-sm">
            <div>
              <Link to={`/students/${encodeURIComponent(selected.student)}`} className="font-semibold hover:text-brand-600">
                {selected.student_name ?? selected.student}
              </Link>
              <p className="text-xs text-slate-500">
                {selected.student_group ?? ""} · {formatDate(selected.from_date)} → {formatDate(selected.to_date)} (
                {selected.total_leave_days ?? "?"} days)
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs font-medium uppercase text-slate-400">Reason given</p>
              <p className="mt-1 whitespace-pre-wrap">{selected.reason || "—"}</p>
            </div>
            {selected.custom_supporting_document && (
              <a
                href={fileUrl(selected.custom_supporting_document)}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-sm font-medium text-brand-600 dark:text-brand-300"
              >
                Open supporting document →
              </a>
            )}
            {canDecide(selected) ? (
              <>
                <p className="text-xs text-slate-400">
                  Approving marks the days as leave rather than absence in the register. You cannot change what the
                  parent wrote — only the decision.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="danger"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ name: selected.name, status: "Rejected" })}
                  >
                    Reject
                  </Button>
                  <Button disabled={decide.isPending} onClick={() => decide.mutate({ name: selected.name, status: "Approved" })}>
                    {decide.isPending ? "Saving…" : "Approve"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">
                Only the homeroom teacher of this student's section can approve or reject this request.
              </p>
            )}
            {decide.isError && <p className="text-xs text-red-600">{(decide.error as Error).message}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function AttendancePage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "late";
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const range = useDateRange();
  const [formOpen, setFormOpen] = useState(false);

  const tabs = [
    { key: "late", label: "Late" },
    { key: "sick", label: "Sick" },
    { key: "permission", label: "Permission" },
    { key: "leave", label: "Leave requests" },
  ];

  // Creating these three is the homeroom teacher's job — the server enforces
  // it with a Before Save guard, so showing the button to anyone else would
  // only produce a rejection.
  const canLog = session.canLogAttendanceEvents;
  const addLabel = canLog
    ? { late: "Log late arrival", sick: "Log sick day", permission: "Record permission" }[tab]
    : undefined;

  return (
    <div>
      <PageTitle
        title="Attendance records"
        subtitle="Late arrivals, sick days and permission leaves for your sections"
        actions={
          <>
            <Link
              to="/attendance/insight"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <BarChart3 size={16} /> <span className="hidden sm:inline">Insight</span>
            </Link>
            {addLabel && tab !== "leave" && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus size={16} /> <span className="hidden sm:inline">{addLabel}</span>
                <span className="sm:hidden">Log</span>
              </Button>
            )}
          </>
        }
      />
      {!canLog && tab !== "leave" && (
        <Card className="mb-3 flex items-start gap-2 py-2.5">
          <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            You can see these records for students you teach. Recording them is the homeroom teacher's
            responsibility — mark the register from your timetable and a homeroom teacher will follow up.
          </p>
        </Card>
      )}
      <div className="mb-3">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>
      {tab !== "leave" && (
        <div className="mb-4">
          <RangeInputs range={range} />
        </div>
      )}

      {tab === "late" && (
        <RecordList<{ name: string; student: string; date: string; time?: string; reason?: string }>
          doctype="Student Late Record"
          fields={["name", "student", "date", "time", "reason"]}
          range={range}
          emptyHint="Late arrivals logged in this date range will appear here."
          render={(r, nameOf) => (
            <Card key={r.name} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/students/${encodeURIComponent(r.student)}`} className="truncate text-sm font-semibold hover:text-brand-600">
                  {nameOf(r.student)}
                </Link>
                <p className="truncate text-xs text-slate-500">{r.reason || "No reason recorded"}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDate(r.date)}
                <br />
                {formatTime(r.time)}
              </div>
            </Card>
          )}
        />
      )}
      {tab === "sick" && (
        <RecordList<{ name: string; student: string; date: string; type?: string; details?: string; parent_contacted?: number; leave_early?: number }>
          doctype="Student Sick Record"
          fields={["name", "student", "date", "type", "details", "parent_contacted", "leave_early"]}
          range={range}
          emptyHint="Sick day records in this date range will appear here."
          render={(r, nameOf) => (
            <Card key={r.name} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/students/${encodeURIComponent(r.student)}`} className="truncate text-sm font-semibold hover:text-brand-600">
                  {nameOf(r.student)}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {r.type}
                  {r.details ? ` — ${r.details}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-slate-500">{formatDate(r.date)}</span>
                <span className="flex gap-1">
                  {!!r.parent_contacted && <Badge tone="green">parent ✓</Badge>}
                  {!!r.leave_early && <Badge tone="amber">left early</Badge>}
                </span>
              </div>
            </Card>
          )}
        />
      )}
      {tab === "permission" && (
        <RecordList<{ name: string; student: string; date: string; time?: string; reason?: string; detail?: string }>
          doctype="Student Permission Leave"
          fields={["name", "student", "date", "time", "reason", "detail"]}
          range={range}
          emptyHint="Permission leaves in this date range will appear here."
          render={(r, nameOf) => (
            <Card key={r.name} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Link to={`/students/${encodeURIComponent(r.student)}`} className="truncate text-sm font-semibold hover:text-brand-600">
                  {nameOf(r.student)}
                </Link>
                <p className="truncate text-xs text-slate-500">
                  {r.reason}
                  {r.detail ? ` — ${r.detail}` : ""}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDate(r.date)}
                <br />
                {formatTime(r.time)}
              </div>
            </Card>
          )}
        />
      )}
      {tab === "leave" && <StudentLeaveTab />}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={addLabel ?? ""}>
        {tab === "late" && <LateForm onDone={() => setFormOpen(false)} />}
        {tab === "sick" && <SickForm onDone={() => setFormOpen(false)} />}
        {tab === "permission" && <PermissionForm onDone={() => setFormOpen(false)} />}
      </Modal>
    </div>
  );
}
