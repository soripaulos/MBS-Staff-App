import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarDays, GraduationCap, Inbox, MessageSquare, Stethoscope, Users, FileQuestion } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useAcademic } from "@/providers/AcademicProvider";
import { getCount, getList } from "@/lib/api";
import { dualDate, formatTime, today } from "@/lib/dates";
import type { CourseScheduleRow, TeacherParentMessageRow } from "@/lib/types";
import { Card, Skeleton, Badge } from "@/components/ui";

function Tile({
  to,
  label,
  value,
  icon,
  loading,
}: {
  to: string;
  label: string;
  value: number | string | undefined;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-3 transition-shadow hover:shadow-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300">
          {icon}
        </div>
        <div className="min-w-0">
          {loading ? <Skeleton className="h-6 w-10" /> : <p className="text-xl font-bold leading-tight">{value ?? "—"}</p>}
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

function TodayClasses() {
  const session = useSession();
  const t = today();
  const { data, isLoading } = useQuery({
    queryKey: ["today-classes", session.instructor?.name, t],
    enabled: !!session.instructor,
    queryFn: () =>
      getList<CourseScheduleRow>("Course Schedule", {
        filters: [["instructor", "=", session.instructor!.name], ["schedule_date", "=", t]],
        fields: ["name", "course", "student_group", "room", "schedule_date", "from_time", "to_time"],
        orderBy: "from_time asc",
        limit: 20,
      }),
  });

  if (!session.instructor) return null;
  const now = new Date().toTimeString().slice(0, 8);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Today's classes</h2>
        <Link to="/timetable" className="text-sm font-medium text-brand-600 dark:text-brand-300">
          Full timetable →
        </Link>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !data?.length ? (
        <p className="py-4 text-sm text-slate-500">No classes scheduled today.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.map((c) => {
            const live = c.from_time <= now && now <= c.to_time;
            const next = c.from_time > now;
            return (
              <li key={c.name} className="flex items-center gap-3 py-2.5">
                <div className="w-20 shrink-0 text-xs text-slate-500">
                  {formatTime(c.from_time)}
                  <br />
                  {formatTime(c.to_time)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.course}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.student_group}
                    {c.room ? ` · ${c.room}` : ""}
                  </p>
                </div>
                {live && <Badge tone="green">Now</Badge>}
                {!live && next && <Badge tone="blue">Next</Badge>}
                <Link
                  to={`/attendance/take/${encodeURIComponent(c.name)}`}
                  className="rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/40"
                >
                  Attendance
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { user, fullName } = useAuth();
  const session = useSession();
  const { year } = useAcademic();
  const t = today();

  const myGroups = session.groupsTaught.filter((g) => !year || g.academic_year === year);
  const subjects = new Set(session.subjectPairs.map((p) => p.course));

  const parentReplies = useQuery({
    queryKey: ["dash-replies", user],
    enabled: session.isTeacher,
    queryFn: () => getCount("Teacher Parent Message", [["teacher", "=", user!], ["status", "=", "Responded"]]).catch(() => 0),
  });
  const openAppeals = useQuery({
    queryKey: ["dash-appeals"],
    enabled: session.isAdmin,
    queryFn: () => getCount("Appeal Result", [["status", "=", "Open"]]).catch(() => undefined),
  });

  const studentsCount = useQuery({
    queryKey: ["dash-students"],
    enabled: session.isLeadership,
    queryFn: () => getCount("Student", [["enabled", "=", 1]]).catch(() => undefined),
  });
  const latesToday = useQuery({
    queryKey: ["dash-lates", t],
    enabled: session.isLeadership,
    queryFn: () => getCount("Student Late Record", [["date", "=", t]]).catch(() => undefined),
  });
  const sickToday = useQuery({
    queryKey: ["dash-sick", t],
    enabled: session.isLeadership,
    queryFn: () => getCount("Student Sick Record", [["date", "=", t]]).catch(() => undefined),
  });
  const pendingLeaves = useQuery({
    queryKey: ["dash-pending-leaves"],
    enabled: session.isLeadership,
    queryFn: () => getCount("Student Leave Application", [["custom_status", "=", "Pending"]]).catch(() => undefined),
  });
  const openFeedback = useQuery({
    queryKey: ["dash-feedback"],
    enabled: session.isAdmin,
    queryFn: () => getCount("Student Feedback", [["status", "=", "Open"]]).catch(() => undefined),
  });

  const firstName = (session.instructor?.instructor_name ?? fullName ?? user ?? "").split(" ")[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {firstName}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{dualDate(new Date())}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {session.isTeacher && (
          <>
            <Tile to="/students" label="My sections" value={myGroups.length} icon={<Users size={20} />} />
            <Tile to="/results" label="Subjects I teach" value={subjects.size} icon={<GraduationCap size={20} />} />
            <Tile
              to="/messages"
              label="Parent replies"
              value={parentReplies.data}
              loading={parentReplies.isLoading}
              icon={<MessageSquare size={20} />}
            />
          </>
        )}
        {session.isAdmin && (
          <Tile
            to="/results?tab=appeals"
            label="Open grade appeals"
            value={openAppeals.data}
            loading={openAppeals.isLoading}
            icon={<FileQuestion size={20} />}
          />
        )}
        {session.isLeadership && (
          <>
            <Tile to="/students" label="Active students" value={studentsCount.data} loading={studentsCount.isLoading} icon={<Users size={20} />} />
            <Tile to="/attendance/records?tab=late" label="Late today" value={latesToday.data} loading={latesToday.isLoading} icon={<AlarmClock size={20} />} />
            <Tile to="/attendance/records?tab=sick" label="Sick today" value={sickToday.data} loading={sickToday.isLoading} icon={<Stethoscope size={20} />} />
            <Tile
              to="/attendance/records?tab=leave"
              label="Pending leave requests"
              value={pendingLeaves.data}
              loading={pendingLeaves.isLoading}
              icon={<CalendarDays size={20} />}
            />
            {session.isAdmin && (
              <Tile to="/notifications?tab=feedback" label="Open feedback" value={openFeedback.data} loading={openFeedback.isLoading} icon={<Inbox size={20} />} />
            )}
          </>
        )}
      </div>

      <TodayClasses />

      {session.homeroomGroups.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">My homeroom</h2>
          <div className="flex flex-wrap gap-2">
            {session.homeroomGroups.map((g) => (
              <Link
                key={g.name}
                to={`/students?group=${encodeURIComponent(g.name)}`}
                className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100 dark:bg-brand-900/50 dark:text-brand-200"
              >
                {g.student_group_name}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
