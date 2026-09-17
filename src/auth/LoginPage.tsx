import { Navigate } from "react-router-dom";
import { ArrowRight, CalendarDays, ClipboardCheck, GraduationCap, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { OAUTH_CLIENT_ID } from "@/lib/config";
import { dualDate } from "@/lib/dates";

const capabilities = [
  { icon: CalendarDays, title: "Plan your day", detail: "Classes and timetables" },
  { icon: ClipboardCheck, title: "Keep learning moving", detail: "Attendance and records" },
  { icon: GraduationCap, title: "See progress clearly", detail: "Results and student support" },
];

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f7f6f0] px-4 py-4 text-[#171a3b] sm:px-6 sm:py-6 lg:flex lg:items-center lg:justify-center lg:p-8">
      <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-[#f7c848]/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-[#e970a7]/15 blur-3xl" />

      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-[#171a3b]/10 bg-white shadow-[0_30px_80px_rgba(23,26,59,0.16)] lg:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden bg-[#171a3b] px-6 py-8 text-white sm:px-10 sm:py-11 lg:min-h-[42rem] lg:px-12 lg:py-14">
          <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#2b326b]" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-3">
              <img src="/brand/mbs-staff-mark.svg" alt="MBS Staff" className="h-12 w-12 rounded-2xl shadow-lg shadow-black/20" />
              <div>
                <p className="text-sm font-semibold tracking-[0.02em]">Makko Billi School</p>
                <p className="text-xs text-white/60">Staff companion</p>
              </div>
            </div>

            <div className="my-auto py-12 lg:py-0">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-[#ffe6a1] backdrop-blur">
                <ShieldCheck size={15} aria-hidden="true" /> Secure school access
              </div>
              <h1 className="max-w-md text-4xl font-bold leading-[1.02] tracking-tight sm:text-5xl">
                Your school day,<span className="block sm:inline"> in one place.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/72 sm:text-lg">
                A focused workspace for teaching, student support and the details that keep Makko Billi moving forward.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-sm">
                  <Icon size={20} className="text-[#ffd559]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/55">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-h-[31rem] flex-col px-6 py-8 sm:px-10 sm:py-11 lg:min-h-[42rem] lg:px-12 lg:py-14">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center rounded-full bg-[#fff4cf] px-3 py-1.5 text-xs font-semibold text-[#71510a]">MBS Staff</span>
            <span className="text-right text-xs font-medium text-slate-500">{dualDate(new Date())}</span>
          </div>

          <div className="my-auto max-w-sm py-10">
            <img src="/brand/mbs-staff-mark.svg" alt="" className="mb-7 h-20 w-20 rounded-[1.45rem] shadow-[0_12px_28px_rgba(23,26,59,0.18)]" />
            <h2 className="text-3xl font-bold tracking-tight text-[#171a3b]">Welcome back</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sign in with your Makko Billi School account. Your workspace adapts to the roles and sections you support.
            </p>

            <button
              type="button"
              onClick={login}
              disabled={!OAUTH_CLIENT_ID}
              className="group mt-8 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#171a3b] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_22px_rgba(23,26,59,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#2b326b] hover:shadow-[0_16px_28px_rgba(23,26,59,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e970a7] active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
            >
              Continue with your school account
              <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>

            {!OAUTH_CLIENT_ID && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                App not configured: set <code>VITE_OAUTH_CLIENT_ID</code> in the deployment environment.
              </p>
            )}
          </div>

          <p className="text-center text-xs leading-5 text-slate-400">Protected school workspace · Staff access only</p>
        </section>
      </div>
    </main>
  );
}
