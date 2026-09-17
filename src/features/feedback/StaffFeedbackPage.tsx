import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, Plus } from "lucide-react";
import { createDoc, getList, updateDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { formatDate } from "@/lib/dates";
import type { StaffFeedbackRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Textarea, statusTone } from "@/components/ui";

/**
 * Staff → school. The mirror of `Student Feedback`, which already exists for
 * the other direction.
 *
 * Teachers see only what they raised (`if_owner` on the doctype); leadership
 * sees everything and is the only side that can set a status or write a
 * response — a Before Save guard puts those fields back if anyone else tries.
 */

const CATEGORIES = [
  "Facilities",
  "Curriculum & materials",
  "Workload & scheduling",
  "Student welfare",
  "Management & communication",
  "IT & systems",
  "Professional development",
  "Other",
];

const FIELDS = ["name", "subject", "category", "status", "details", "raised_by", "raised_on", "response", "responded_by"];

export default function StaffFeedbackPage() {
  const { user } = useAuth();
  const session = useSession();
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selected, setSelected] = useState<StaffFeedbackRow | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [details, setDetails] = useState("");
  const [response, setResponse] = useState("");

  const q = useQuery({
    queryKey: ["staff-feedback", user, statusFilter],
    queryFn: () =>
      getList<StaffFeedbackRow>("Staff Feedback", {
        filters: (statusFilter === "All" ? [] : [["status", "=", statusFilter]]) as never,
        fields: FIELDS,
        orderBy: "creation desc",
        limit: 200,
      }),
  });

  const raise = useMutation({
    mutationFn: () => createDoc("Staff Feedback", { subject, category, details }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-feedback"] });
      setComposeOpen(false);
      setSubject("");
      setDetails("");
      setCategory(CATEGORIES[0]);
    },
  });

  const respond = useMutation({
    mutationFn: ({ name, status }: { name: string; status: string }) =>
      updateDoc("Staff Feedback", name, { status, response }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["staff-feedback"] });
      setSelected(null);
      setResponse("");
    },
  });

  return (
    <div>
      <PageTitle
        title="Staff feedback"
        subtitle={session.isLeadership ? "What staff have raised with the school" : "Raise something with the school"}
        actions={
          <Button onClick={() => setComposeOpen(true)}>
            <Plus size={16} /> <span className="hidden sm:inline">Raise something</span>
            <span className="sm:hidden">New</span>
          </Button>
        }
      />

      <div className="mb-3">
        <Select className="max-w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
          {["All", "Open", "In Review", "Resolved", "Closed"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>

      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title="Nothing raised yet"
          hint="Anything about facilities, workload, materials or how things are run — the school sees it and replies here."
          icon={<MessageSquarePlus size={40} />}
        />
      ) : (
        <div className="space-y-2">
          {q.data.map((f) => (
            <button
              key={f.name}
              className="w-full text-left"
              onClick={() => {
                setSelected(f);
                setResponse(f.response ?? "");
              }}
            >
              <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{f.subject}</p>
                  <p className="truncate text-xs text-slate-500">
                    {f.category} · {formatDate(f.raised_on)}
                    {session.isLeadership && f.raised_by ? ` · ${f.raised_by}` : ""}
                  </p>
                  {f.response && <p className="truncate text-xs italic text-slate-400">Replied: {f.response.slice(0, 70)}</p>}
                </div>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Raise something with the school">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            raise.mutate();
          }}
        >
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} required />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Details</Label>
            <Textarea rows={5} value={details} onChange={(e) => setDetails(e.target.value)} required />
          </div>
          <p className="text-xs text-slate-400">
            This goes to the Director and Education Managers. Your name is attached — it is not anonymous.
          </p>
          <Button type="submit" className="w-full" disabled={raise.isPending || !subject.trim() || !details.trim()}>
            {raise.isPending ? "Sending…" : "Send"}
          </Button>
          {raise.isError && <p className="text-xs text-red-600">{(raise.error as Error).message}</p>}
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.subject ?? ""}>
        {selected && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              {selected.category} · {formatDate(selected.raised_on)}
              {session.isLeadership && selected.raised_by ? ` · ${selected.raised_by}` : ""}
            </p>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="whitespace-pre-wrap">{selected.details || "—"}</p>
            </div>
            {selected.response && !session.isLeadership && (
              <div className="rounded-lg bg-brand-50 p-3 dark:bg-brand-900/30">
                <p className="mb-1 text-[11px] font-semibold uppercase text-brand-600 dark:text-brand-300">
                  Reply{selected.responded_by ? ` from ${selected.responded_by}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{selected.response}</p>
              </div>
            )}
            {session.isLeadership ? (
              <>
                <div>
                  <Label>Response</Label>
                  <Textarea rows={3} value={response} onChange={(e) => setResponse(e.target.value)} />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ name: selected.name, status: "In Review" })}>
                    In review
                  </Button>
                  <Button variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ name: selected.name, status: "Closed" })}>
                    Close
                  </Button>
                  <Button disabled={respond.isPending} onClick={() => respond.mutate({ name: selected.name, status: "Resolved" })}>
                    {respond.isPending ? "Saving…" : "Resolve"}
                  </Button>
                </div>
                {respond.isError && <p className="text-xs text-red-600">{(respond.error as Error).message}</p>}
              </>
            ) : (
              <p className="text-xs text-slate-400">
                {selected.status === "Open" ? "Waiting to be picked up." : `Marked ${selected.status.toLowerCase()} by the school.`}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
