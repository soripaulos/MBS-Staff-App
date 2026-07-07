import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Plus } from "lucide-react";
import { createDoc, getList } from "@/lib/api";
import { useSession } from "@/providers/SessionProvider";
import { formatDate, today } from "@/lib/dates";
import type { LeaveApplicationRow } from "@/lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Label, ListSkeleton, Modal, PageTitle, Select, Tabs, Textarea, statusTone } from "@/components/ui";

function ApplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const session = useSession();
  const [leaveType, setLeaveType] = useState("");
  const [fromDate, setFromDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [reason, setReason] = useState("");

  const types = useQuery({
    queryKey: ["leave-types"],
    enabled: open,
    queryFn: () => getList<{ name: string }>("Leave Type", { fields: ["name"], limit: 30 }),
  });

  const m = useMutation({
    mutationFn: () =>
      createDoc("Leave Application", {
        employee: session.employee!.name,
        leave_type: leaveType || types.data?.[0]?.name,
        from_date: fromDate,
        to_date: toDate,
        description: reason,
        status: "Open",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-leave"] });
      onClose();
      setReason("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <div>
          <Label>Leave type</Label>
          <Select value={leaveType || types.data?.[0]?.name || ""} onChange={(e) => setLeaveType(e.target.value)}>
            {(types.data ?? []).map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <p className="text-xs text-slate-400">Your application goes to your leave approver / HR for review.</p>
        <Button type="submit" className="w-full" disabled={m.isPending || !session.employee}>
          {m.isPending ? "Submitting…" : "Submit application"}
        </Button>
        {m.isError && <p className="text-xs text-red-600">{(m.error as Error).message}</p>}
      </form>
    </Modal>
  );
}

const LEAVE_FIELDS = ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "description", "docstatus"];

function LeaveList({ mine }: { mine: boolean }) {
  const session = useSession();
  const q = useQuery({
    queryKey: ["my-leave", mine, session.employee?.name],
    enabled: mine ? !!session.employee : session.isHR,
    queryFn: () =>
      getList<LeaveApplicationRow>("Leave Application", {
        filters: mine ? [["employee", "=", session.employee!.name]] : [["status", "=", "Open"], ["docstatus", "=", 0]],
        fields: LEAVE_FIELDS,
        orderBy: "from_date desc",
        limit: 100,
      }),
  });
  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data?.length)
    return (
      <EmptyState
        title={mine ? "No leave applications" : "Nothing pending"}
        hint={mine ? "Your leave history will appear here." : "Open staff leave applications awaiting review will appear here."}
        icon={<Briefcase size={40} />}
      />
    );
  return (
    <div className="space-y-2">
      {q.data.map((l) => (
        <Card key={l.name} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {mine ? l.leave_type : `${l.employee_name ?? l.employee} · ${l.leave_type}`}
            </p>
            <p className="truncate text-xs text-slate-500">
              {formatDate(l.from_date)} → {formatDate(l.to_date)}
              {l.total_leave_days ? ` · ${l.total_leave_days} day${l.total_leave_days === 1 ? "" : "s"}` : ""}
              {l.description ? ` · ${l.description}` : ""}
            </p>
          </div>
          <Badge tone={statusTone(l.status === "Open" ? "Pending" : l.status)}>{l.status === "Open" ? "Pending" : l.status}</Badge>
        </Card>
      ))}
      {!mine && (
        <p className="text-xs text-slate-400">
          Approving or rejecting runs the HR workflow — open the application on the desk to action it.
        </p>
      )}
    </div>
  );
}

export default function StaffLeavePage() {
  const session = useSession();
  const [tab, setTab] = useState("mine");
  const [applyOpen, setApplyOpen] = useState(false);
  const tabs = [
    { key: "mine", label: "My applications" },
    ...(session.isHR ? [{ key: "pending", label: "Pending approval" }] : []),
  ];
  return (
    <div>
      <PageTitle
        title="Staff leave"
        subtitle={session.employee?.employee_name ?? undefined}
        actions={
          session.employee ? (
            <Button onClick={() => setApplyOpen(true)}>
              <Plus size={16} /> Apply
            </Button>
          ) : undefined
        }
      />
      {!session.employee && !session.isHR ? (
        <EmptyState title="No employee record linked" hint="Ask HR to link your user account to your Employee record." />
      ) : (
        <>
          <div className="mb-4">
            <Tabs tabs={tabs} active={tab} onChange={setTab} />
          </div>
          <LeaveList mine={tab === "mine"} />
        </>
      )}
      <ApplyModal open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
