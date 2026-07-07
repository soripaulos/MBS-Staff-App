import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Megaphone, Plus } from "lucide-react";
import { call, createDoc, fileUrl, getList, updateDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useMyGroups } from "@/features/shared/useGroups";
import { NOTIFICATION_CATEGORIES } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { cn, stripHtml } from "@/lib/utils";
import type { AppNotificationRow, NotificationLogRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Tabs, Textarea, statusTone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* personal inbox (Notification Log)                                   */
/* ------------------------------------------------------------------ */

function InboxTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notification-log", user],
    queryFn: () =>
      getList<NotificationLogRow>("Notification Log", {
        filters: [["for_user", "=", user!]],
        fields: ["name", "subject", "email_content", "type", "document_type", "document_name", "read", "creation"],
        orderBy: "creation desc",
        limit: 50,
      }),
  });

  const markRead = useMutation({
    mutationFn: (name: string) => call("frappe.client.set_value", { doctype: "Notification Log", name, fieldname: "read", value: 1 }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-log"] });
      void qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });
  const markAll = useMutation({
    mutationFn: async () => {
      for (const n of (q.data ?? []).filter((n) => !n.read)) {
        await call("frappe.client.set_value", { doctype: "Notification Log", name: n.name, fieldname: "read", value: 1 });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-log"] });
      void qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });

  if (q.isLoading) return <ListSkeleton rows={6} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const rows = q.data ?? [];
  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="space-y-2">
      {unread > 0 && (
        <div className="flex justify-end">
          <Button variant="secondary" className="min-h-0 px-3 py-1.5 text-xs" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck size={14} /> Mark all read ({unread})
          </Button>
        </div>
      )}
      {!rows.length ? (
        <EmptyState title="No notifications" hint="Mentions, assignments and system alerts for you appear here." icon={<Bell size={40} />} />
      ) : (
        rows.map((n) => (
          <button key={n.name} className="w-full text-left" onClick={() => !n.read && markRead.mutate(n.name)}>
            <Card className={cn("flex items-start gap-3", !n.read && "border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-900/20")}>
              <div className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-500")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" dangerouslySetInnerHTML={{ __html: n.subject }} />
                {n.email_content && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{stripHtml(n.email_content)}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{formatDate(n.creation?.slice(0, 10))}</span>
            </Card>
          </button>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* school broadcasts (App Notification)                                */
/* ------------------------------------------------------------------ */

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { groups } = useMyGroups();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("General");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "groups">("all");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const m = useMutation({
    mutationFn: () =>
      createDoc("App Notification", {
        title,
        notification_category: category,
        message,
        send_to_all_students: audience === "all" ? 1 : 0,
        student_groups: audience === "groups" ? selectedGroups.map((g) => ({ student_group: g })) : [],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["app-notifications"] });
      onClose();
      setTitle("");
      setMessage("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="New notification">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={140} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Message</Label>
          <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </div>
        <div>
          <Label>Audience</Label>
          <Select value={audience} onChange={(e) => setAudience(e.target.value as "all" | "groups")}>
            <option value="all">All students</option>
            <option value="groups">Specific sections</option>
          </Select>
        </div>
        {audience === "groups" && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            {groups.map((g) => (
              <label key={g.name} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedGroups.includes(g.name)}
                  onChange={(e) =>
                    setSelectedGroups((s) => (e.target.checked ? [...s, g.name] : s.filter((x) => x !== g.name)))
                  }
                />
                {g.student_group_name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">
          Saved as a <b>Draft</b>. Delivery to student devices runs through the school's send flow — open the record on the desk to
          send, or ask ICT to trigger it.
        </p>
        <Button type="submit" className="w-full" disabled={m.isPending || (audience === "groups" && !selectedGroups.length)}>
          {m.isPending ? "Saving…" : "Save draft"}
        </Button>
        {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

function BroadcastsTab() {
  const session = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const [category, setCategory] = useState("All");
  const q = useQuery({
    queryKey: ["app-notifications", category],
    queryFn: () =>
      getList<AppNotificationRow>("App Notification", {
        filters: category === "All" ? [] : ([[["notification_category", "=", category]]][0] as never),
        fields: ["name", "title", "status", "sent_date", "notification_category", "message", "send_to_all_students", "creation"],
        orderBy: "creation desc",
        limit: 50,
      }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select className="max-w-44" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option>All</option>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        {session.canBroadcast && (
          <Button className="ml-auto" onClick={() => setComposeOpen(true)}>
            <Plus size={16} /> New
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No broadcasts" hint="School-wide notifications sent to the student app appear here." icon={<Megaphone size={40} />} />
      ) : (
        q.data.map((n) => (
          <Card key={n.name} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{n.title}</p>
              <div className="flex shrink-0 gap-1.5">
                <Badge tone="slate">{n.notification_category}</Badge>
                <Badge tone={statusTone(n.status)}>{n.status}</Badge>
              </div>
            </div>
            <p className="line-clamp-2 text-xs text-slate-500">{n.message}</p>
            <p className="text-[11px] text-slate-400">
              {n.send_to_all_students ? "All students" : "Selected sections"} · {formatDate((n.sent_date ?? n.creation)?.slice(0, 10))}
            </p>
          </Card>
        ))
      )}
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* admin feedback inbox (Student Feedback)                             */
/* ------------------------------------------------------------------ */

interface FeedbackRow {
  name: string;
  student?: string;
  student_name?: string;
  status: string;
  category?: string;
  subcategory?: string;
  specific_issue?: string;
  details?: string;
  attachment?: string | null;
  creation?: string;
}

function FeedbackTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("Open");
  const [selected, setSelected] = useState<FeedbackRow | null>(null);
  const q = useQuery({
    queryKey: ["student-feedback", status],
    queryFn: () =>
      getList<FeedbackRow>("Student Feedback", {
        filters: status === "All" ? [] : ([["status", "=", status]] as never),
        fields: ["name", "student", "student_name", "status", "category", "subcategory", "specific_issue", "details", "attachment", "creation"],
        orderBy: "creation desc",
        limit: 100,
      }),
  });
  const update = useMutation({
    mutationFn: ({ name, newStatus }: { name: string; newStatus: string }) => updateDoc("Student Feedback", name, { status: newStatus }),
    onSuccess: () => {
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["student-feedback"] });
    },
  });

  return (
    <div className="space-y-3">
      <Select className="max-w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        {["Open", "In Review", "Resolved", "Closed", "All"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </Select>
      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No feedback" hint="Feedback submitted from the student app appears here for triage." />
      ) : (
        q.data.map((f) => (
          <button key={f.name} className="w-full text-left" onClick={() => setSelected(f)}>
            <Card className="flex items-center gap-3 hover:shadow-md">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {[f.category, f.subcategory, f.specific_issue].filter(Boolean).join(" › ") || "Feedback"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {f.student_name ?? "Anonymous"} · {formatDate(f.creation?.slice(0, 10))}
                </p>
              </div>
              <Badge tone={statusTone(f.status)}>{f.status}</Badge>
            </Card>
          </button>
        ))
      )}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Feedback">
        {selected && (
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{[selected.category, selected.subcategory, selected.specific_issue].filter(Boolean).join(" › ")}</p>
            <p className="text-xs text-slate-500">
              {selected.student_name ?? "Anonymous"} · {formatDate(selected.creation?.slice(0, 10))}
            </p>
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 dark:bg-slate-800">{selected.details || "—"}</div>
            {selected.attachment && (
              <img src={fileUrl(selected.attachment)} alt="Attachment" className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700" />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {["In Review", "Resolved", "Closed"].map((s) => (
                <Button
                  key={s}
                  variant={s === "Resolved" ? "primary" : "secondary"}
                  disabled={update.isPending || selected.status === s}
                  onClick={() => update.mutate({ name: selected.name, newStatus: s })}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function NotificationsPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "inbox";
  const tabs = [
    { key: "inbox", label: "My inbox" },
    { key: "broadcasts", label: "School broadcasts" },
    ...(session.isAdmin ? [{ key: "feedback", label: "Feedback inbox" }] : []),
  ];
  return (
    <div>
      <PageTitle title="Notifications" />
      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
      </div>
      {tab === "inbox" && <InboxTab />}
      {tab === "broadcasts" && <BroadcastsTab />}
      {tab === "feedback" && session.isAdmin && <FeedbackTab />}
    </div>
  );
}
