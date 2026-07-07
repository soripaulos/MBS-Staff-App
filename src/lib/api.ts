import { FRAPPE_URL } from "./config";
import { clearTokens, loadTokens, saveTokens } from "@/auth/tokens";
import { refreshTokens } from "@/auth/oauth";

export class FrappeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshing: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  const t = loadTokens();
  if (!t) throw new FrappeError(401, "Not signed in");
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) {
    clearTokens();
    throw new FrappeError(401, "Session expired");
  }
  refreshing ??= refreshTokens(t.refresh_token)
    .then((nt) => {
      saveTokens(nt);
      return nt.access_token;
    })
    .catch((e) => {
      clearTokens();
      window.dispatchEvent(new Event("mbs:signed-out"));
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (typeof b.exception === "string") return b.exception.split(":").pop()?.trim() || fallback;
    if (typeof b._server_messages === "string") {
      try {
        const msgs = JSON.parse(b._server_messages) as string[];
        const first = msgs[0] ? (JSON.parse(msgs[0]) as { message?: string }) : null;
        if (first?.message) return first.message.replace(/<[^>]+>/g, "");
      } catch {
        /* ignore */
      }
    }
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${FRAPPE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearTokens();
    window.dispatchEvent(new Event("mbs:signed-out"));
    throw new FrappeError(401, "Session expired — please sign in again.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new FrappeError(res.status, extractMessage(body, `Request failed (${res.status})`));
  }
  return body as T;
}

export type Filters = (string | number | boolean | (string | number | boolean | string[] | number[])[])[][] | Record<string, unknown>;

export interface ListOptions {
  filters?: Filters;
  fields?: string[];
  limit?: number;
  start?: number;
  orderBy?: string;
  parent?: string;
}

export async function getList<T = Record<string, unknown>>(doctype: string, opts: ListOptions = {}): Promise<T[]> {
  const params = new URLSearchParams();
  params.set("fields", JSON.stringify(opts.fields ?? ["name"]));
  if (opts.filters) params.set("filters", JSON.stringify(opts.filters));
  params.set("limit_page_length", String(opts.limit ?? 100));
  if (opts.start) params.set("limit_start", String(opts.start));
  if (opts.orderBy) params.set("order_by", opts.orderBy);
  if (opts.parent) params.set("parent", opts.parent);
  const res = await request<{ data: T[] }>(`/api/resource/${encodeURIComponent(doctype)}?${params}`);
  return res.data;
}

/** For child doctypes: frappe.client.get_list with an explicit parent doctype. */
export async function getChildList<T = Record<string, unknown>>(
  doctype: string,
  parentDoctype: string,
  opts: ListOptions = {},
): Promise<T[]> {
  const res = await call<T[]>("frappe.client.get_list", {
    doctype,
    parent: parentDoctype,
    filters: opts.filters ?? {},
    fields: opts.fields ?? ["name"],
    limit_page_length: opts.limit ?? 100,
    order_by: opts.orderBy,
  });
  return res;
}

export async function getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
  const res = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  return res.data;
}

export async function getCount(doctype: string, filters?: Filters): Promise<number> {
  return call<number>("frappe.client.get_count", { doctype, filters: filters ?? {} });
}

export async function createDoc<T = Record<string, unknown>>(doctype: string, doc: Record<string, unknown>): Promise<T> {
  const res = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
  return res.data;
}

export async function updateDoc<T = Record<string, unknown>>(
  doctype: string,
  name: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const res = await request<{ data: T }>(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return res.data;
}

/** Submit a submittable document (docstatus 0 → 1). */
export async function submitDoc(doc: Record<string, unknown>): Promise<void> {
  await call("frappe.client.submit", { doc: JSON.stringify(doc) });
}

/** GET /api/method/<method>. Returns the `message`. */
export async function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const qs = params
    ? "?" +
      new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
        ) as Record<string, string>,
      ).toString()
    : "";
  const res = await request<{ message: T }>(`/api/method/${method}${qs}`);
  return res.message;
}

/** POST /api/method/<method>. Returns the `message`. */
export async function postCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await request<{ message: T }>(`/api/method/${method}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return res.message;
}

/** Authenticated file/PDF download → triggers browser save. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${FRAPPE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new FrappeError(res.status, "Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return path.startsWith("http") ? path : `${FRAPPE_URL}${path}`;
}
