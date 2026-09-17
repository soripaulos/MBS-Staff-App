import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Plus, Send, Sparkles } from "lucide-react";
import { createDoc, getDoc, getList, updateDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useGroupStudents, useMyGroups } from "@/features/shared/useGroups";
import { useStudentNames } from "@/features/shared/useStudentNames";
import { formatDate, formatDateTime, nowDatetime, today } from "@/lib/dates";
import { cn, stripHtml } from "@/lib/utils";
import type { MessageEntry, TeacherParentMessageRow } from "@/lib/types";
import { SECTIONS, draftMessage, draftSubject } from "./messageBuilder";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea, statusTone } from "@/components/ui";

/**
 * Parent messages, as a conversation rather than a form.
 *
 * `Teacher Parent Message` was built for one message and one reply, and the
 * parents' app reads those three fields (`message`, `parent_response`,
 * `teacher_followup`). Rather than break it, anything past the first follow-up
 * is appended to a `custom_conversation` child table, and the thread view
 * stitches the two together in order. So old threads still render, the
 * parents' app still works, and the back-and-forth can carry on indefinitely.
 */

const LIST_FIELDS = [
  "name", "student", "student_group", "teacher", "message_date", "status", "subject",
  "message", "parent_response", "parent_response_date", "teacher_followup", "teacher_followup_date",
];

interface Turn {
  from: "Teacher" | "Parent";
  who?: string | null;
  at?: string | null;
  text: string;
}

function turnsOf(row: TeacherParentMessageRow): Turn[] {
  const t: Turn[] = [];
  if (row.message) t.push({ from: "Teacher", at: row.message_date, text: stripHtml(row.message) });
  if (row.parent_response) t.push({ from: "Parent", at: row.parent_response_date, text: stripHtml(row.parent_response) });
  if (row.teacher_followup) t.push({ from: "Teacher", at: row.teacher_followup_date, text: stripHtml(row.teacher_followup) });
  for (const e of row.custom_conversation ?? []) {
    t.push({ from: e.sender_type, who: e.sender_name, at: e.sent_on, text: stripHtml(e.content) });
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* compose                                                             */
/* ------------------------------------------------------------------ */

function ComposeModal({ open, onClose, presetStudent }: { open: boolean; onClose: () => void; presetStudent?: string | null }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { groups } = useMyGroups();
  const [group, setGroup] = useState<string | null>(null);
  const effectiveGroup = group ?? groups[0]?.name ?? null;
  const students = useGroupStudents(effectiveGroup);
  const [student, setStudent] = useState(presetStudent ?? "");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [edited, setEdited] = useState(false);

  const studentName = (students.data ?? []).find((s) => s.student === student)?.student_name ?? "";

  // If the teacher has started rewriting the draft by hand, stop overwriting it.
  useEffect(() => {
    if (edited) return;
    setMessage(draftMessage(studentName, picks, extra));
  }, [picks, extra, studentName, edited]);
  useEffect(() => {
    if (!subject || !edited) setSubject(draftSubject(studentName, picks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, studentName]);

  useEffect(() => {
    if (presetStudent) setStudent(presetStudent);
  }, [presetStudent]);

  const reset = () => {
    setPicks({});
    setExtra("");
    setMessage("");
    setSubject("");
    setEdited(false);
    setStudent("");
  };

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
      reset();
    },
  });

  const picked = Object.keys(picks).length;

  return (
    <Modal open={open} onClose={onClose} title="Message a parent" wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Section</Label>
            <Select
              value={effectiveGroup ?? ""}
              onChange={(e) => {
                setGroup(e.target.value);
                setStudent("");
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
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Sparkles size={14} className="text-brand-600 dark:text-brand-300" />
            <Label className="mb-0">Build the message</Label>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Tap what applies. The message writes itself below and you can change any of it before sending. Tap again to
            unpick.
          </p>
          <div className="space-y-3">
            {SECTIONS.map((s) => (
              <div key={s.key}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.options.map((o) => {
                    const on = picks[s.key] === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() =>
                          setPicks((p) => {
                            const next = { ...p };
                            if (next[s.key] === o.key) delete next[s.key];
                            else next[s.key] = o.key;
                            return next;
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          on
                            ? o.tone === "concern"
                              ? "border-amber-500 bg-amber-500 text-white"
                              : o.tone === "good"
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-brand-600 bg-brand-600 text-white"
                            : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label>Anything else (optional)</Label>
          <Textarea
            rows={2}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="A specific example, a date, something only you would know…"
          />
        </div>

        <div>
          <Label>Subject</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={140} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="mb-0">Message</Label>
            {edited && (
              <button
                type="button"
                className="text-xs font-medium text-brand-600 dark:text-brand-300"
                onClick={() => {
                  setEdited(false);
                  setMessage(draftMessage(studentName, picks, extra));
                }}
              >
                Rebuild from selections
              </button>
            )}
          </div>
          <Textarea
            rows={6}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setEdited(true);
            }}
            placeholder={picked ? "" : "Pick a few things above, or just write the message yourself."}
            required
          />
        </div>

        <p className="text-xs text-slate-400">The parent sees this in the student app's Hub and can reply there.</p>
        <Button type="submit" className="w-full" disabled={!student || !message.trim() || m.isPending}>
          {m.isPending ? "Sending…" : "Send message"}
        </Button>
        {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* thread                                                              */
/* ------------------------------------------------------------------ */

function ChatThread({ name, studentName, onBack }: { name: string; studentName: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { user, fullName } = useAuth();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["parent-message", name],
    queryFn: () => getDoc<TeacherParentMessageRow>("Teacher Parent Message", name),
  });

  const turns = useMemo(() => (q.data ? turnsOf(q.data) : []), [q.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length]);

  const send = useMutation({
    mutationFn: async (content: string) => {
      const doc = await getDoc<TeacherParentMessageRow>("Teacher Parent Message", name);
      // The first follow-up goes in the legacy field so the parents' app shows
      // it; everything after that is appended to the conversation table.
      if (!doc.teacher_followup) {
        return updateDoc("Teacher Parent Message", name, {
          teacher_followup: content,
          teacher_followup_date: today(),
        });
      }
      const conversation: MessageEntry[] = [
        ...(doc.custom_conversation ?? []),
        {
          sender_type: "Teacher",
          sender: user ?? undefined,
          sender_name: fullName ?? user ?? undefined,
          sent_on: nowDatetime(),
          content,
        },
      ];
      return updateDoc("Teacher Parent Message", name, { custom_conversation: conversation });
    },
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["parent-message", name] });
      void qc.invalidateQueries({ queryKey: ["parent-messages"] });
    },
  });

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col md:h-[calc(100vh-11rem)]">
      <div className="mb-2 flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        <button onClick={onBack} aria-label="Back to messages" className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{studentName}</p>
          <p className="truncate text-xs text-slate-500">{q.data?.subject ?? ""}</p>
        </div>
        {q.data?.status && <Badge tone={statusTone(q.data.status)}>{q.data.status === "Responded" ? "Parent replied" : q.data.status}</Badge>}
      </div>

      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-0.5 py-2">
        {q.isLoading ? (
          <ListSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          turns.map((t, i) => {
            const mine = t.from === "Teacher";
            return (
              <div key={i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    mine
                      ? "rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
                  )}
                >
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  <p className={cn("mt-1 text-[10px]", mine ? "text-brand-100" : "text-slate-400")}>
                    {t.who ? `${t.who} · ` : mine ? "" : "Parent · "}
                    {t.at && (t.at.includes(" ") ? formatDateTime(t.at) : formatDate(t.at))}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate(text.trim());
        }}
      >
        <Textarea
          rows={1}
          className="max-h-32 min-h-[40px] resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a reply…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) send.mutate(text.trim());
            }
          }}
        />
        <Button type="submit" disabled={!text.trim() || send.isPending} aria-label="Send">
          <Send size={16} />
        </Button>
      </form>
      {send.isError && <p className="pt-1 text-xs text-red-600">{(send.error as Error).message}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* page                                                                */
/* ------------------------------------------------------------------ */

export default function MessagesPage() {
  const { user } = useAuth();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const thread = params.get("thread");
  const composeOpen = params.get("compose") === "1";
  const presetStudent = params.get("student");
  const [filter, setFilter] = useState(params.get("filter") ?? "All");

  const setThread = (name: string | null) =>
    setParams(name ? { thread: name } : {}, { replace: true });
  const setCompose = (on: boolean) =>
    setParams(on ? { compose: "1", ...(presetStudent ? { student: presetStudent } : {}) } : {}, { replace: true });

  const q = useQuery({
    queryKey: ["parent-messages", user, filter, session.isAdmin],
    queryFn: () =>
      getList<TeacherParentMessageRow>("Teacher Parent Message", {
        filters: [
          // Teachers see only their own threads; admins see all.
          ...(session.isAdmin ? [] : [["teacher", "=", user!]]),
          ...(filter !== "All" ? [["status", "=", filter]] : []),
        ] as never,
        fields: LIST_FIELDS,
        orderBy: "modified desc",
        limit: 100,
      }),
  });

  const { nameOf } = useStudentNames((q.data ?? []).map((r) => r.student));
  const selected = (q.data ?? []).find((r) => r.name === thread) ?? null;

  const list = (
    <div className="space-y-2">
      <Select className="max-w-44" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status filter">
        {["All", "Unread", "Read", "Responded"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
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
        q.data.map((row) => {
          const last = stripHtml(row.teacher_followup || row.parent_response || row.message);
          return (
            <button key={row.name} className="w-full text-left" onClick={() => setThread(row.name)}>
              <Card
                className={cn(
                  "flex items-center gap-3 transition-shadow hover:shadow-md",
                  thread === row.name && "ring-2 ring-brand-500",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{nameOf(row.student)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {row.subject ?? "(no subject)"} · {formatDate(row.message_date)}
                  </p>
                  {last && <p className="truncate text-xs italic text-slate-400">{last.slice(0, 80)}</p>}
                </div>
                {row.status === "Responded" ? (
                  <Badge tone="green">Replied</Badge>
                ) : (
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                )}
              </Card>
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <div>
      <PageTitle
        title="Parent messages"
        subtitle={session.isAdmin ? "All teacher–parent threads" : "Your conversations with parents"}
        actions={
          <Button onClick={() => setCompose(true)}>
            <Plus size={16} /> <span className="hidden sm:inline">New message</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      {/* Mobile: one pane at a time. Desktop: list beside the thread. */}
      <div className="md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-4">
        <div className={cn(thread && "hidden md:block")}>{list}</div>
        <div className={cn(!thread && "hidden md:block")}>
          {selected ? (
            <Card className="p-3">
              <ChatThread name={selected.name} studentName={nameOf(selected.student)} onBack={() => setThread(null)} />
            </Card>
          ) : (
            <div className="hidden md:block">
              <EmptyState title="Pick a conversation" hint="Or start a new one — the builder writes the first draft for you." icon={<MessageSquare size={40} />} />
            </div>
          )}
        </div>
      </div>

      <ComposeModal open={composeOpen} onClose={() => setCompose(false)} presetStudent={presetStudent} />
    </div>
  );
}
