import type { PortalErrorCode } from "@shared/portal-types";

/**
 * Fetch wrapper for the customer portal. Deliberately NOT apiRequest/getQueryFn
 * from queryClient.ts: those call the staff session-expiry handler on 401,
 * which would log the staff user out and redirect to /auth.
 */
export class PortalApiError extends Error {
  status: number;
  code: PortalErrorCode | string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)PORTAL-XSRF-TOKEN=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function portalFetch<T = unknown>(method: string, url: string, body?: unknown | FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) {
    const token = csrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    throw new PortalApiError(res.status, data?.code ?? "PORTAL_SERVER_ERROR", data?.error ?? data?.message ?? res.statusText);
  }
  return data as T;
}

/** For useQuery: queryKey = ['portal', '/api/portal/…'] */
export async function portalQueryFn<T>({ queryKey }: { queryKey: readonly unknown[] }): Promise<T> {
  return portalFetch<T>("GET", String(queryKey[1]));
}
