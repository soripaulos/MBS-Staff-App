import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { OAUTH_CLIENT_ID } from "@/lib/config";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#fffdf7] px-5 py-8 text-[#151a3b]">
      <section className="w-full max-w-sm rounded-[2rem] border border-[#151a3b]/10 bg-white px-7 py-9 text-center shadow-[0_18px_48px_rgba(21,26,59,0.12)] sm:px-9">
        <img
          src="/brand/mbs-staff-icon.png"
          alt="MBS Staff"
          className="mx-auto h-28 w-28 rounded-[1.65rem] object-cover shadow-[0_10px_24px_rgba(21,26,59,0.16)]"
        />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">MBS Staff</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Sign in with your Makko Billi School account.</p>

        <button
          type="button"
          onClick={login}
          disabled={!OAUTH_CLIENT_ID}
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#151a3b] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#293067] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e9589c] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Sign in with school account
        </button>

        {!OAUTH_CLIENT_ID && (
          <p className="mt-3 text-xs leading-5 text-amber-800">
            App not configured: set <code>VITE_OAUTH_CLIENT_ID</code> in the deployment environment.
          </p>
        )}
      </section>
    </main>
  );
}
