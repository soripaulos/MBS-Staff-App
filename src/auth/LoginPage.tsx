import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui";
import { OAUTH_CLIENT_ID } from "@/lib/config";
import { dualDate } from "@/lib/dates";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-800 to-brand-950 p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 text-3xl font-black backdrop-blur">
          MB
        </div>
        <h1 className="text-2xl font-bold">Makko Billi Staff</h1>
        <p className="mt-1 text-sm text-brand-100">{dualDate(new Date())}</p>
        <p className="mt-6 text-sm text-brand-50/90">
          Sign in with your Makko Billi School account. You will see exactly what your role allows — timetables, results,
          attendance, notifications and more.
        </p>
        <Button
          onClick={login}
          disabled={!OAUTH_CLIENT_ID}
          className="mt-8 w-full bg-white text-brand-800 hover:bg-brand-50 disabled:bg-white/60"
        >
          Sign in with school account
        </Button>
        {!OAUTH_CLIENT_ID && (
          <p className="mt-3 text-xs text-amber-200">
            App not configured: set <code>VITE_OAUTH_CLIENT_ID</code> in the deployment environment.
          </p>
        )}
        <p className="mt-10 text-[11px] text-brand-200/70">Makko Billi School · staff use only</p>
      </div>
    </div>
  );
}
