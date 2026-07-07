import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Send } from "lucide-react";
import { createDoc, getList, updateDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useGroupStudents, useMyGroups } from "@/features/shared/useGroups";
import { formatDate, today } from "@/lib/dates";
import { stripHtml } from "@/lib/utils";
import type { TeacherParentMessageRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea, statusTone } from "@/components/ui";

const FIELDS = [
  "name", "student", "student_group", "teacher", "message_date", "status", "subject",
  "message", "parent_response", "parent_response_date", "teacher_followup", "teacher_followup_date",
];

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { groups } = useMyGroups();
  const [group, setGroup] = useState<string | null>(null);
  const effectiveGroup = group ?? groups[0]?.name ?? null;
  const students = useGroupStudents(effectiveGroup);
  const [student, setStudent] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const m = useMutation({
    mutationFn: () =>
      createDoc("Teacher Parent Message", {
        student,
        student_group: effectiveGroup,
        teacher: user,
        message_date: today(),
        status: "Unread",
        subject,
        message,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["parent-messages"] });
      onClose();
      setSubject("");
      setMessage("");
      setStudent("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Message a parent">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div>
          <Label>Section</Label>
          <Select value={effectiveGroup ?? ""} onChange={(e) => { setGroup(e.target.value); setStudent(""); }}>
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.student_group_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Student</Label>
          <Select value={student} onChange={(e) => setStudent(e.target.value)} required>
            <option value="">Select student…</option>
            {(students.data ?? []).map((s) => (
              <option key={s.student} value={s.student}>
                {s.student_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={140} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </div>
        <p className="text-xs text-slate-400">The parent sees this in the student app's Hub and can reply there.</p>
        <Button type="submit" className="w-full" disabled={!student || m.isPending}>
          {m.isPending ? "Sending…" : "Send message"}
        </Button>
        {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

function ThreadModal({ row, onClose }: { row: TeacherParentMessageRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [followup, setFollowup] = useState("");
  const m = useMutation({
    mutationFn: () =>
      updateDoc("Teacher Parent Message", row!.name, {
        teacher_followup: followup,
        teacher_followup_date: today(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["parent-messages"] });
      onClose();
      setFollowup("");
    },
  });

  return (
    <Modal open={!!row} onClose={onClose} title={row?.subject ?? "Message"} wide>
      {row && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-slate-500">
            {row.student} · {row.student_group} · {formatDate(row.message_date)}
          </p>
          <div className="rounded-lg bg-brand-50 p-3 dark:bg-brand-900/30">
            <p className="mb-1 text-[11px] font-semibold uppercase text-brand-600 dark:text-brand-300">You wrote</p>
            <p className="whitespace-pre-wrap">{stripHtml(row.message)}</p>
          </div>
          {row.parent_response ? (
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
              <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                Parent replied {row.parent_response_date ? `· ${formatDate(row.parent_response_date)}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{stripHtml(row.parent_response)}</p>
            </div>
          ) : (
            <p className="text-xs italic text-slate-400">No parent reply yet.</p>
          )}
          {row.teacher_followup && (
            <div className="rounded-lg bg-brand-50 p-3 dark:bg-brand-900/30">
              <p className="mb-1 text-[11px] font-semibold uppercase text-brand-600 dark:text-brand-300">
                Your follow-up {row.teacher_followup_date ? `· ${formatDate(row.teacher_followup_date)}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{stripHtml(row.teacher_followup)}</p>
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <Input value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="Write a follow-up…" />
            <Button type="submit" disabled={!followup.trim() || m.isPending} aria-label="Send follow-up">
              <Send size={16} />
            </Button>
          </form>
          {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
        </div>
      )}
    </Modal>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const session = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState<TeacherParentMessageRow | null>(null);
  const [filter, setFilter] = useState("All");

  const q = useQuery({
    queryKey: ["parent-messages", user, filter, session.isAdmin],
    queryFn: () =>
      getList<TeacherParentMessageRow>("Teacher Parent Message", {
        filters: [
          // Teachers see only their own threads; admins see all.
          ...(session.isAdmin ? [] : [["teacher", "=", user!]]),
          ...(filter !== "All" ? [["status", "=", filter]] : []),
        ] as never,
        fields: FIELDS,
        orderBy: "modified desc",
        limit: 100,
      }),
  });

  return (
    <div>
      <PageTitle
        title="Parent messages"
        subtitle={session.isAdmin ? "All teacher–parent threads" : "Messages you sent to parents via the student app"}
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <Plus size={16} /> New message
          </Button>
        }
      />
      <div className="mb-4">
        <Select className="max-w-44" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status filter">
          {["All", "Unread", "Read", "Responded"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title="No messages"
          hint="Messages you send to parents — and their replies — will appear here."
          icon={<MessageSquare size={40} />}
        />
      ) : (
        <div className="space-y-2">
          {q.data.map((row) => (
            <button key={row.name} className="w-full text-left" onClick={() => setSelected(row)}>
              <Card className="flex items-center gap-3 hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.subject ?? "(no subject)"}</p>
                  <p className="truncate text-xs text-slate-500">
                    {row.student ?? row.student_group ?? ""} · {formatDate(row.message_date)}
                    {row.parent_response ? ` · “${stripHtml(row.parent_response).slice(0, 60)}”` : ""}
                  </p>
                </div>
                <Badge tone={statusTone(row.status)}>{row.status === "Responded" ? "Parent replied" : row.status}</Badge>
              </Card>
            </button>
          ))}
        </div>
      )}
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
      <ThreadModal row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
