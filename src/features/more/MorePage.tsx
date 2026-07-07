import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  Briefcase,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Download,
  MessageSquare,
  Moon,
  Star,
  Sun,
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

  const items = [
    { to: "/attendance", label: "Attendance records", icon: <ClipboardCheck size={20} />, show: session.isTeacher || session.isLeadership },
    { to: "/notifications", label: "Notifications", icon: <Bell size={20} />, show: true },
    { to: "/messages", label: "Parent messages", icon: <MessageSquare size={20} />, show: session.isTeacher || session.isLeadership },
    { to: "/evaluations", label: "Teacher evaluations", icon: <Star size={20} />, show: session.isTeacher || session.isLeadership },
    { to: "/analytics", label: "Analytics", icon: <ChartNoAxesCombined size={20} />, show: session.isLeadership },
    { to: "/leave", label: "My leave", icon: <Briefcase size={20} />, show: !!session.employee || session.isHR },
  ].filter((i) => i.show);

  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title="More" />
      <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <span className="text-brand-600 dark:text-brand-300">{i.icon}</span>
            <span className="flex-1 text-sm font-medium">{i.label}</span>
            <ChevronRight size={16} className="text-slate-400" />
          </Link>
        ))}
      </Card>

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
