import { FRAPPE_URL, OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI } from "@/lib/config";
import { randomString, s256Challenge } from "./pkce";
import { saveTokens, type StoredTokens } from "./tokens";

const VERIFIER_KEY = "mbs-staff.pkce_verifier";
const STATE_KEY = "mbs-staff.oauth_state";

export async function beginLogin() {
  const verifier = randomString(96);
  const state = randomString(24);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const challenge = await s256Challenge(verifier);
  const params = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    response_type: "code",
    scope: "all openid",
    redirect_uri: OAUTH_REDIRECT_URI,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.href = `${FRAPPE_URL}/api/method/frappe.integrations.oauth2.authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<StoredTokens> {
  // Form-urlencoded + empty Expect header: the verified working pattern against this site.
  const res = await fetch(`${FRAPPE_URL}/api/method/frappe.integrations.oauth2.get_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Expect: "" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

export async function exchangeCode(code: string, state: string): Promise<StoredTokens> {
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier || !expectedState || state !== expectedState) {
    throw new Error("Login session expired — please try again.");
  }
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    client_id: OAUTH_CLIENT_ID,
    code_verifier: verifier,
  });
}

export async function refreshTokens(refresh_token: string): Promise<StoredTokens> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token,
    client_id: OAUTH_CLIENT_ID,
  });
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${FRAPPE_URL}/api/method/frappe.integrations.oauth2.revoke_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Expect: "" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // best effort — client-side sign-out proceeds regardless
  }
}
