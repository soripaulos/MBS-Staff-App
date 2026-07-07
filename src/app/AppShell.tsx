import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  GraduationCap,
  Home,
  LogOut,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Star,
  Sun,
  Users,
  WifiOff,
  Briefcase,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useSession } from "@/providers/SessionProvider";
import { useAcademic } from "@/providers/AcademicProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { getCount } from "@/lib/api";
import { cn, initials } from "@/lib/utils";
import { dualDate } from "@/lib/dates";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  show: boolean;
}

function useNavItems(): { primary: NavItem[]; more: NavItem[] } {
  const s = useSession();
  const primary: NavItem[] = [
    { to: "/", label: "Home", icon: <Home size={20} />, show: true },
    { to: "/timetable", label: "Timetable", icon: <CalendarDays size={20} />, show: true },
    { to: "/results", label: "Results", icon: <GraduationCap size={20} />, show: s.isTeacher || s.isLeadership },
    { to: "/students", label: "Students", icon: <Users size={20} />, show: s.isTeacher || s.isLeadership },
    { to: "/more", label: "More", icon: <MoreHorizontal size={20} />, show: true },
  ];
  const more: NavItem[] = [
    { to: "/attendance", label: "Attendance", icon: <ClipboardCheck size={20} />, show: s.isTeacher || s.isLeadership },
    { to: "/notifications", label: "Notifications", icon: <Bell size={20} />, show: true },
    { to: "/messages", label: "Parent Messages", icon: <MessageSquare size={20} />, show: s.isTeacher || s.isLeadership },
    { to: "/evaluations", label: "My Evaluations", icon: <Star size={20} />, show: s.isTeacher || s.isLeadership },
    { to: "/analytics", label: "Analytics", icon: <ChartNoAxesCombined size={20} />, show: s.isLeadership },
    { to: "/leave", label: "My Leave", icon: <Briefcase size={20} />, show: !!s.employee || s.isHR },
  ];
  return { primary: primary.filter((i) => i.show), more: more.filter((i) => i.show) };
}

function OnlineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950">
      <WifiOff size={14} /> Offline — showing the last data this device saw. Changes are disabled.
    </div>
  );
}

export default function AppShell() {
  const { user, fullName, logout } = useAuth();
  const session = useSession();
  const academic = useAcademic();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { primary, more } = useNavItems();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ["unread-notifications", user],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: () => getCount("Notification Log", [["for_user", "=", user!], ["read", "=", 0]]).catch(() => 0),
  });

  const dark = document.documentElement.classList.contains("dark");

  return (
    <div className="flex min-h-screen flex-col">
      <OnlineBanner />
      {/* header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <button onClick={() => navigate("/")} className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">MB</span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-bold leading-tight">Makko Billi Staff</span>
              <span className="block text-[11px] leading-tight text-slate-500 dark:text-slate-400">{dualDate(new Date())}</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {/* year/term picker */}
            <select
              aria-label="Academic year"
              className="max-w-[7.5rem] rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              value={academic.year ?? ""}
              onChange={(e) => academic.setYear(e.target.value)}
            >
              {academic.years.map((y) => (
                <option key={y.name} value={y.name}>
                  {y.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Academic term"
              className="hidden max-w-[10rem] rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 md:block"
              value={academic.term ?? ""}
              onChange={(e) => academic.setTerm(e.target.value)}
            >
              {academic.termsOfYear.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name.replace(academic.year ?? "", "").replace(/[()]/g, "").trim() || t.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => navigate("/notifications")}
              aria-label="Notifications"
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Bell size={20} />
              {!!unread && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Account menu"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200"
              >
                {initials(session.instructor?.instructor_name ?? fullName ?? user)}
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-sm font-semibold">{session.instructor?.instructor_name ?? fullName ?? user}</p>
                    <p className="truncate text-xs text-slate-500">{user}</p>
                    {session.roles.length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-slate-400">
                        {session.roles.filter((r) => !["All", "Guest", "Desk User", "System User"].includes(r)).slice(0, 3).join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setTheme(dark ? "light" : "dark")}
                  >
                    {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? "Light mode" : "Dark mode"}
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* desktop side rail */}
        <nav className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-800 md:flex">
          {[...primary.filter((i) => i.to !== "/more"), ...more].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <main className="w-full min-w-0 flex-1 px-4 pb-24 pt-4 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950 md:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}>
          {primary.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  isActive ? "text-brand-600 dark:text-brand-300" : "text-slate-500 dark:text-slate-400",
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
