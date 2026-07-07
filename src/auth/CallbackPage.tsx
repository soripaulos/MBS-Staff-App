import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeCode } from "./oauth";
import { useAuth } from "./AuthProvider";
import { FRAPPE_URL } from "@/lib/config";
import { Button } from "@/components/ui";

export default function CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code");
    const state = params.get("state") ?? "";
    if (!code) {
      setError(params.get("error_description") ?? "Sign-in was cancelled.");
      return;
    }
    exchangeCode(code, state)
      .then(async (tokens) => {
        const res = await fetch(`${FRAPPE_URL}/api/method/frappe.integrations.oauth2.openid_profile`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = (await res.json()) as { email?: string; name?: string };
        if (!profile.email) throw new Error("Could not load your profile.");
        setSignedIn(profile.email, profile.name);
        navigate("/", { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [params, navigate, setSignedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {error ? (
        <div className="text-center">
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <Button onClick={() => navigate("/login", { replace: true })}>Back to sign in</Button>
        </div>
      ) : (
        <p className="animate-pulse text-sm text-slate-500">Signing you in…</p>
      )}
    </div>
  );
}
