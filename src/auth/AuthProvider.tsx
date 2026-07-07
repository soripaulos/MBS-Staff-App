import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FRAPPE_URL } from "@/lib/config";
import { beginLogin, revokeToken } from "./oauth";
import { clearTokens, loadTokens } from "./tokens";

interface AuthState {
  /** signed-in user's email (Frappe User.name) */
  user: string | null;
  fullName: string | null;
  loading: boolean;
  login: () => void;
  logout: () => void;
  setSignedIn: (email: string, fullName?: string) => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function useAuth() {
  return useContext(AuthContext);
}

interface OpenIdProfile {
  email?: string;
  name?: string;
  given_name?: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tokens = loadTokens();
    if (!tokens) {
      setLoading(false);
      return;
    }
    // Identify the user from the OpenID profile endpoint.
    fetch(`${FRAPPE_URL}/api/method/frappe.integrations.oauth2.openid_profile`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("profile failed");
        const p = (await r.json()) as OpenIdProfile;
        if (p.email) {
          setUser(p.email);
          setFullName(p.name ?? null);
        } else {
          clearTokens();
        }
      })
      .catch(() => clearTokens())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setFullName(null);
    };
    window.addEventListener("mbs:signed-out", onSignedOut);
    return () => window.removeEventListener("mbs:signed-out", onSignedOut);
  }, []);

  const login = useCallback(() => {
    void beginLogin();
  }, []);

  const logout = useCallback(() => {
    const t = loadTokens();
    if (t) void revokeToken(t.access_token);
    clearTokens();
    setUser(null);
    setFullName(null);
  }, []);

  const setSignedIn = useCallback((email: string, name?: string) => {
    setUser(email);
    if (name) setFullName(name);
  }, []);

  const value = useMemo(
    () => ({ user, fullName, loading, login, logout, setSignedIn }),
    [user, fullName, loading, login, logout, setSignedIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
