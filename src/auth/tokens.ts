export interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  /** epoch ms when the access token expires */
  expires_at: number;
}

const KEY = "mbs-staff.tokens.v1";

// sessionStorage per the project security policy (tokens never persist across browser sessions).
export function loadTokens(): StoredTokens | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(t: StoredTokens) {
  sessionStorage.setItem(KEY, JSON.stringify(t));
}

export function clearTokens() {
  sessionStorage.removeItem(KEY);
}
