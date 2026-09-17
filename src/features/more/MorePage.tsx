import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  Briefcase,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Download,
  MessageSquare,
  Moon,
  Star,
  Sun,
  Users,
} from "lucide-react";
import { useSession } from "@/providers/SessionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Card, PageTitle } from "@/components/ui";
import { APP_NAME } from "@/lib/config";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
});

export default function MorePage() {
  const session = useSession();
  const { theme, setTheme } = useTheme();
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);
  const [notifState, setNotifState] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");

  useEffect(() => {
    const onPrompt = () => setCanInstall(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const teaches = !!session.instructor;
  const sections: { heading: string; items: { to: string; label: string; hint?: string; icon: React.ReactNode; show: boolean }[] }[] = [
    {
      heading: "Teaching",
      items: [
        { to: "/students", label: "Students", hint: "Rosters, profiles, records, evaluations", icon: <Users size={20} />, show: session.isTeacher || session.isLeadership },
        { to: "/timetable", label: "Timetable", hint: "Your week and section timetables", icon: <CalendarDays size={20} />, show: !teaches },
        { to: "/attendance/records", label: "Attendance records", hint: "Late, sick and permission history", icon: <ClipboardCheck size={20} />, show: session.isTeacher || session.isLeadership },
      ],
    },
    {
      heading: "Communication",
      items: [
        { to: "/messages", label: "Parent messages", hint: "Your threads with parents", icon: <MessageSquare size={20} />, show: session.isTeacher || session.isLeadership },
        { to: "/notifications", label: "Notifications", hint: "Your inbox and school broadcasts", icon: <Bell size={20} />, show: true },
      ],
    },
    {
      heading: "You",
      items: [
        { to: "/evaluations", label: "My evaluations", hint: "Anonymous ratings of your teaching", icon: <Star size={20} />, show: session.isTeacher || session.isLeadership },
        { to: "/leave", label: "My leave", hint: "Apply and track your leave", icon: <Briefcase size={20} />, show: !!session.employee || session.isHR },
        { to: "/analytics", label: "Insights", hint: "School-wide trends", icon: <ChartNoAxesCombined size={20} />, show: session.isLeadership },
      ],
    },
  ]
    .map((s) => ({ ...s, items: s.items.filter((i) => i.show) }))
    .filter((s) => s.items.length > 0);

  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title="More" />
      {sections.map((s) => (
        <div key={s.heading}>
          <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.heading}</h2>
          <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
            {s.items.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span className="shrink-0 text-brand-600 dark:text-brand-300">{i.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.label}</span>
                  {i.hint && <span className="block truncate text-xs text-slate-500">{i.hint}</span>}
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" />
              </Link>
            ))}
          </Card>
        </div>
      ))}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button
          className="flex w-full items-center gap-3 text-sm"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          <span className="text-brand-600 dark:text-brand-300">{isDark ? <Sun size={20} /> : <Moon size={20} />}</span>
          <span className="flex-1 text-left font-medium">Theme</span>
          <span className="text-xs text-slate-500">{theme}</span>
        </button>
        <button
          className="flex w-full items-center gap-3 text-sm disabled:opacity-50"
          disabled={notifState === "granted"}
          onClick={async () => {
            if (typeof Notification === "undefined") return;
            const res = await Notification.requestPermission();
            setNotifState(res);
          }}
        >
          <span className="text-brand-600 dark:text-brand-300">
            <BellRing size={20} />
          </span>
          <span className="flex-1 text-left font-medium">Device notifications</span>
          <span className="text-xs text-slate-500">{notifState === "granted" ? "enabled" : notifState === "denied" ? "blocked in browser" : "tap to enable"}</span>
        </button>
        {canInstall && (
          <button
            className="flex w-full items-center gap-3 text-sm"
            onClick={async () => {
              await deferredPrompt?.prompt();
              setCanInstall(false);
            }}
          >
            <span className="text-brand-600 dark:text-brand-300">
              <Download size={20} />
            </span>
            <span className="flex-1 text-left font-medium">Install app</span>
            <span className="text-xs text-slate-500">add to home screen</span>
          </button>
        )}
      </Card>

      <p className="text-center text-xs text-slate-400">
        {APP_NAME} · v0.1 · Makko Billi School ICT
        <br />
        On iPhone: Share → Add to Home Screen to install.
      </p>
    </div>
  );
}
