import { useQuery } from "@tanstack/react-query";
import { getList } from "@/lib/api";

export interface StudentBrief {
  name: string;
  student_name: string;
  image?: string | null;
  custom_school_id?: string | null;
}

/**
 * Resolve student IDs to names.
 *
 * Records across the app (parent messages, late/sick/permission, leave
 * applications) carry only the student ID, and an ID means nothing to a
 * teacher. This batches the lookup and caches it, so a list of 200 records
 * costs one request.
 *
 * Reads are scoped server-side to the caller's own sections, so any ID outside
 * their scope simply won't come back — callers fall back to the raw ID.
 */
export function useStudentNames(ids: (string | undefined | null)[]) {
  const unique = [...new Set(ids.filter((v): v is string => !!v))].sort();
  const key = unique.join(",");

  const q = useQuery({
    queryKey: ["student-names", key],
    enabled: unique.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const map = new Map<string, StudentBrief>();
      // Chunked so a big roster doesn't build an over-long query string.
      for (let i = 0; i < unique.length; i += 100) {
        const slice = unique.slice(i, i + 100);
        const rows = await getList<StudentBrief>("Student", {
          filters: [["name", "in", slice]],
          fields: ["name", "student_name", "image", "custom_school_id"],
          limit: slice.length,
        }).catch(() => [] as StudentBrief[]);
        for (const r of rows) map.set(r.name, r);
      }
      return map;
    },
  });

  const map = q.data;
  return {
    loading: q.isLoading,
    /** Display name for a student ID, falling back to the ID itself. */
    nameOf: (id?: string | null) => (id ? (map?.get(id)?.student_name ?? id) : "—"),
    briefOf: (id?: string | null) => (id ? map?.get(id) : undefined),
  };
}
