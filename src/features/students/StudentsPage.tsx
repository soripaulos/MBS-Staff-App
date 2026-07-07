import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { getList, fileUrl } from "@/lib/api";
import { useSession } from "@/providers/SessionProvider";
import { useGroupStudents, useMyGroups } from "@/features/shared/useGroups";
import { Card, EmptyState, Input, ListSkeleton, PageTitle, Select } from "@/components/ui";
import { initials } from "@/lib/utils";

export default function StudentsPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const { groups, loading } = useMyGroups();
  const group = params.get("group") ?? groups[0]?.name ?? null;
  const students = useGroupStudents(group);
  const [search, setSearch] = useState("");

  // Leadership can search the whole school.
  const globalSearch = useQuery({
    queryKey: ["student-search", search],
    enabled: session.isLeadership && search.trim().length >= 3,
    queryFn: () =>
      getList<{ name: string; student_name: string; image?: string | null; custom_school_id?: string }>("Student", {
        filters: [["student_name", "like", `%${search.trim()}%`], ["enabled", "=", 1]],
        fields: ["name", "student_name", "image", "custom_school_id"],
        limit: 25,
      }),
  });

  const filtered = (students.data ?? []).filter(
    (s) => !search.trim() || s.student_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const showGlobal = session.isLeadership && search.trim().length >= 3 && (globalSearch.data?.length ?? 0) > 0;

  return (
    <div>
      <PageTitle title="Students" subtitle={group ?? undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          className="max-w-60"
          value={group ?? ""}
          onChange={(e) => setParams({ group: e.target.value }, { replace: true })}
          aria-label="Student group"
        >
          {groups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.student_group_name}
            </option>
          ))}
        </Select>
        <div className="relative min-w-52 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder={session.isLeadership ? "Search section, or any student (3+ letters)…" : "Search this section…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading || students.isLoading ? (
        <ListSkeleton rows={8} />
      ) : showGlobal ? (
        <>
          <p className="mb-2 text-xs font-medium uppercase text-slate-400">School-wide matches</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {globalSearch.data!.map((s) => (
              <Link key={s.name} to={`/students/${encodeURIComponent(s.name)}`}>
                <Card className="flex items-center gap-3 hover:shadow-md">
                  {s.image ? (
                    <img src={fileUrl(s.image)} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                      {initials(s.student_name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.student_name}</p>
                    <p className="truncate text-xs text-slate-500">{s.custom_school_id ?? s.name}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : !group ? (
        <EmptyState title="No sections" hint="You are not assigned to any student group this year." icon={<Users size={40} />} />
      ) : !filtered.length ? (
        <EmptyState title="No students" hint="No matching students in this section." icon={<Users size={40} />} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Link key={s.student} to={`/students/${encodeURIComponent(s.student)}`}>
              <Card className="flex items-center gap-3 hover:shadow-md">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
                  {s.group_roll_number ?? initials(s.student_name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.student_name}</p>
                  <p className="truncate text-xs text-slate-500">{s.student}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
