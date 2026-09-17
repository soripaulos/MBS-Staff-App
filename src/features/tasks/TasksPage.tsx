import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardList, Info } from "lucide-react";
import { getList, updateDoc } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { formatDate, today } from "@/lib/dates";
import { cn, stripHtml } from "@/lib/utils";
import type { TodoRow } from "@/lib/types";
import { Badge, Card, EmptyState, ErrorState, ListSkeleton, PageTitle, Tabs } from "@/components/ui";

/**
 * Work assigned to you by the school.
 *
 * These are Frappe `ToDo` records — the same assignment mechanism the desk
 * uses, so anything assigned there shows up here without a second system. A
 * teacher can tick one off or reopen it and nothing else: they cannot create
 * a task, cannot assign one to anybody, and cannot edit what a task says. The
 * server enforces all three (no `create` permission, and a Before Save guard
 * that rejects any change other than the status), so this screen simply
 * doesn't offer what would be refused.
 */

const FIELDS = [
  "name", "status", "priority", "date", "allocated_to", "description",
  "reference_type", "reference_name", "assigned_by", "assigned_by_full_name",
];

function title(row: TodoRow): string {
  const text = stripHtml(row.description).trim();
  return text.split("\n")[0] || row.reference_name || "Task";
}

function body(row: TodoRow): string {
  const lines = stripHtml(row.description).trim().split("\n").slice(1);
  return lines.join("\n").trim();
}

export default function TasksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("open");

  const q = useQuery({
    queryKey: ["my-todos", user, tab],
    enabled: !!user,
    queryFn: () =>
      getList<TodoRow>("ToDo", {
        filters: [
          ["allocated_to", "=", user!],
          ["status", "=", tab === "open" ? "Open" : "Closed"],
        ] as never,
        fields: FIELDS,
        orderBy: "date asc, modified desc",
        limit: 200,
      }),
  });

  const toggle = useMutation({
    mutationFn: ({ name, status }: { name: string; status: "Open" | "Closed" }) => updateDoc("ToDo", name, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-todos"] });
      void qc.invalidateQueries({ queryKey: ["dash-todos"] });
    },
  });

  const t = today();

  return (
    <div>
      <PageTitle title="My tasks" subtitle="Work assigned to you by the school" />

      <div className="mb-3">
        <Tabs
          tabs={[
            { key: "open", label: "To do" },
            { key: "done", label: "Done" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <Card className="mb-3 flex items-start gap-2 py-2.5">
        <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Tasks are set by the school. You can mark one done or put it back — the wording, dates and who it belongs to
          are not yours to change.
        </p>
      </Card>

      {q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title={tab === "open" ? "Nothing on your list" : "Nothing completed yet"}
          hint="Tasks the school assigns to you appear here."
          icon={<ClipboardList size={40} />}
        />
      ) : (
        <ul className="space-y-2">
          {q.data.map((row) => {
            const done = row.status === "Closed";
            const overdue = !done && !!row.date && row.date < t;
            const detail = body(row);
            return (
              <li key={row.name}>
                <Card className="flex items-start gap-3">
                  <button
                    onClick={() => toggle.mutate({ name: row.name, status: done ? "Open" : "Closed" })}
                    disabled={toggle.isPending}
                    aria-label={done ? "Reopen task" : "Mark task done"}
                    className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600 disabled:opacity-50"
                  >
                    {done ? <CheckCircle2 size={22} className="text-emerald-600" /> : <Circle size={22} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", done && "text-slate-400 line-through")}>{title(row)}</p>
                    {detail && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-slate-500">{detail}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      {row.date && <span className={overdue ? "font-semibold text-red-600" : ""}>Due {formatDate(row.date)}</span>}
                      {row.assigned_by_full_name && <span>· from {row.assigned_by_full_name}</span>}
                      {row.reference_type && row.reference_name && (
                        <span>
                          ·{" "}
                          {row.reference_type === "Student Group" ? (
                            <Link to={`/students?group=${encodeURIComponent(row.reference_name)}`} className="text-brand-600 dark:text-brand-300">
                              {row.reference_name}
                            </Link>
                          ) : (
                            `${row.reference_type}: ${row.reference_name}`
                          )}
                        </span>
                      )}
                    </p>
                  </div>
                  {row.priority && row.priority !== "Medium" && (
                    <Badge tone={row.priority === "High" ? "red" : "slate"}>{row.priority}</Badge>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {toggle.isError && <p className="mt-2 text-sm text-red-600">{(toggle.error as Error).message}</p>}
    </div>
  );
}
