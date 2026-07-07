import { useQuery } from "@tanstack/react-query";
import { getDoc, getList } from "@/lib/api";
import { useSession } from "@/providers/SessionProvider";
import { useAcademic } from "@/providers/AcademicProvider";
import type { GroupStudent, StudentGroup } from "@/lib/types";

/**
 * Student Groups the current user may work with for the selected year.
 * Teachers: groups they teach or homeroom. Leadership: every active group.
 * The server still enforces the real boundary on every data call.
 */
export function useMyGroups() {
  const session = useSession();
  const { year } = useAcademic();

  const leadership = useQuery({
    queryKey: ["all-groups", year],
    enabled: session.isLeadership && !!year,
    staleTime: 10 * 60 * 1000,
    queryFn: () =>
      getList<StudentGroup>("Student Group", {
        filters: [["academic_year", "=", year!], ["disabled", "=", 0]],
        fields: ["name", "student_group_name", "program", "academic_year", "group_based_on", "custom_homeroom_teacher"],
        orderBy: "student_group_name asc",
        limit: 300,
      }),
  });

  if (session.isLeadership) {
    return { groups: leadership.data ?? [], loading: leadership.isLoading };
  }

  const mine = new Map<string, StudentGroup>();
  for (const g of [...session.groupsTaught, ...session.homeroomGroups]) {
    if (!year || g.academic_year === year) mine.set(g.name, g);
  }
  return { groups: [...mine.values()].sort((a, b) => a.student_group_name.localeCompare(b.student_group_name)), loading: session.loading };
}

export function useGroupStudents(group: string | null) {
  return useQuery({
    queryKey: ["group-students", group],
    enabled: !!group,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const doc = await getDoc<{ students?: GroupStudent[] }>("Student Group", group!);
      return (doc.students ?? [])
        .filter((s) => s.active !== 0)
        .sort((a, b) => (a.group_roll_number ?? 999) - (b.group_roll_number ?? 999));
    },
  });
}

/** Subjects the user may open for a given group (teachers: only what they teach there). */
export function useGroupSubjects(group: string | null) {
  const session = useSession();
  const all = useQuery({
    queryKey: ["group-subjects", group],
    enabled: !!group && (session.isLeadership || session.homeroomGroups.some((g) => g.name === group)),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Distinct subjects that actually have results in this group (any term).
      const rows = await getList<{ subject: string }>("Student Term Subject Result", {
        filters: [["student_group", "=", group!]],
        fields: ["subject"],
        limit: 3000,
      });
      return [...new Set(rows.map((r) => r.subject))].sort();
    },
  });

  if (!group) return { subjects: [] as string[], loading: false };
  const taught = session.subjectPairs.filter((p) => p.student_group === group).map((p) => p.course);
  const isHomeroom = session.homeroomGroups.some((g) => g.name === group);
  if (session.isLeadership || isHomeroom) {
    const merged = new Set([...(all.data ?? []), ...taught]);
    return { subjects: [...merged].sort(), loading: all.isLoading };
  }
  return { subjects: [...new Set(taught)].sort(), loading: false };
}
