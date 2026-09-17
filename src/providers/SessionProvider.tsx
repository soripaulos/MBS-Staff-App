import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChildList, getDoc, getList } from "@/lib/api";
import { ymd, addDays } from "@/lib/dates";
import { useAuth } from "@/auth/AuthProvider";
import type { StudentGroup } from "@/lib/types";

export interface SubjectSectionPair {
  course: string;
  student_group: string;
}

export interface StaffContext {
  loading: boolean;
  roles: string[];
  instructor: { name: string; instructor_name: string; image?: string | null } | null;
  employee: { name: string; employee_name?: string } | null;
  /** Student Groups this instructor teaches (any year; filter by selected year in features) */
  groupsTaught: StudentGroup[];
  homeroomGroups: StudentGroup[];
  subjectPairs: SubjectSectionPair[];
  // persona projections — layout hints; the server remains the security boundary
  isTeacher: boolean;
  isAcademicAdmin: boolean;
  isLeadership: boolean;
  isAdmin: boolean;
  isHR: boolean;
  canBroadcast: boolean;
  /** True for the group where this user is `custom_homeroom_teacher`. */
  isHomeroomOf: (group?: string | null) => boolean;
  /**
   * Late days, sick days and permission leaves are the homeroom teacher's
   * responsibility. The server enforces this too (Before Save guards on each
   * doctype); this only decides whether we show the controls.
   */
  canLogAttendanceEvents: boolean;
  refetch: () => void;
}

const SessionContext = createContext<StaffContext>(null as unknown as StaffContext);

export function useSession() {
  return useContext(SessionContext);
}

// `Academics User` is deliberately NOT a leadership role. Nearly every teacher
// on the live site holds it, so treating it as leadership made every teacher a
// school-wide admin in the UI. Leadership is now the roles that actually mean it.
const LEADERSHIP_ROLES = ["Director", "Education Manager", "System Manager", "DD Student Registrar"];
const ADMIN_ROLES = ["System Manager", "Education Manager"];
const HR_ROLES = ["HR Manager", "HR User", "Leave Approver"];
const BROADCAST_ROLES = ["System Manager", "Education Manager", "Director"];

interface UserDoc {
  name: string;
  full_name?: string;
  roles?: { role: string }[];
}

async function fetchStaffContext(user: string) {
  // 1. Roles — read own User doc; tolerate 403 for tightly-locked accounts.
  let roles: string[] = [];
  try {
    const doc = await getDoc<UserDoc>("User", user);
    roles = (doc.roles ?? []).map((r) => r.role);
  } catch {
    roles = [];
  }

  // 2. Instructor identity chain: Instructor.custom_username → fallback Employee.user_id.
  let instructor: { name: string; instructor_name: string; image?: string | null } | null = null;
  let employee: { name: string; employee_name?: string } | null = null;
  try {
    const ins = await getList<{ name: string; instructor_name: string; image?: string | null }>("Instructor", {
      filters: [["custom_username", "=", user]],
      fields: ["name", "instructor_name", "image"],
      limit: 1,
    });
    instructor = ins[0] ?? null;
  } catch {
    /* no read access to Instructor */
  }
  try {
    const emps = await getList<{ name: string; employee_name?: string }>("Employee", {
      filters: [["user_id", "=", user]],
      fields: ["name", "employee_name"],
      limit: 1,
    });
    employee = emps[0] ?? null;
    if (!instructor && employee) {
      const ins = await getList<{ name: string; instructor_name: string; image?: string | null }>("Instructor", {
        filters: [["employee", "=", employee.name]],
        fields: ["name", "instructor_name", "image"],
        limit: 1,
      });
      instructor = ins[0] ?? null;
    }
  } catch {
    /* no Employee access */
  }

  // 3. Teaching scope.
  let groupsTaught: StudentGroup[] = [];
  let homeroomGroups: StudentGroup[] = [];
  let subjectPairs: SubjectSectionPair[] = [];
  const groupFields = [
    "name",
    "student_group_name",
    "program",
    "academic_year",
    "academic_term",
    "group_based_on",
    "custom_homeroom_teacher",
    "disabled",
  ];
  if (instructor) {
    try {
      // Filter the PARENT doctype by a child-table field. Querying the child
      // doctype directly (frappe.client.get_list with parent=...) needs
      // permission on the child doctype itself, which teachers don't have —
      // it returned nothing, so every teacher saw only their homeroom group.
      groupsTaught = await getList<StudentGroup>("Student Group", {
        filters: [
          ["Student Group Instructor", "instructor", "=", instructor.name],
          ["disabled", "=", 0],
        ] as never,
        fields: groupFields,
        limit: 200,
      });
    } catch {
      /* scoped out */
    }
    try {
      homeroomGroups = await getList<StudentGroup>("Student Group", {
        filters: [["custom_homeroom_teacher", "=", instructor.name], ["disabled", "=", 0]],
        fields: groupFields,
        limit: 20,
      });
    } catch {
      /* ignore */
    }
    try {
      // Subject/section pairs from recent + upcoming Course Schedule instances.
      const since = ymd(addDays(new Date(), -120));
      const rows = await getList<{ course: string; student_group: string }>("Course Schedule", {
        filters: [["instructor", "=", instructor.name], ["schedule_date", ">=", since]],
        fields: ["course", "student_group"],
        limit: 2000,
        orderBy: "schedule_date desc",
      });
      const seen = new Set<string>();
      for (const r of rows) {
        const key = `${r.course}::${r.student_group}`;
        if (!seen.has(key)) {
          seen.add(key);
          subjectPairs.push(r);
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { roles, instructor, employee, groupsTaught, homeroomGroups, subjectPairs };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["staff-context", user],
    queryFn: () => fetchStaffContext(user!),
    enabled: !!user,
    staleTime: 60_000, // page-focus refetches pick up permission changes within a minute
    refetchOnWindowFocus: true,
  });

  const d = query.data;
  const roles = d?.roles ?? [];
  const homeroomGroups = d?.homeroomGroups ?? [];
  const isLeadership = roles.some((r) => LEADERSHIP_ROLES.includes(r));
  const isHomeroomOf = (group?: string | null) =>
    !!group && homeroomGroups.some((g) => g.name === group);
  const value: StaffContext = {
    loading: query.isLoading,
    roles,
    instructor: d?.instructor ?? null,
    employee: d?.employee ?? null,
    groupsTaught: d?.groupsTaught ?? [],
    homeroomGroups,
    subjectPairs: d?.subjectPairs ?? [],
    isTeacher: !!d?.instructor || roles.includes("Instructor"),
    isAcademicAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    isLeadership,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    isHR: roles.some((r) => HR_ROLES.includes(r)),
    canBroadcast: roles.some((r) => BROADCAST_ROLES.includes(r)),
    isHomeroomOf,
    canLogAttendanceEvents: isLeadership || homeroomGroups.length > 0,
    refetch: () => void query.refetch(),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
