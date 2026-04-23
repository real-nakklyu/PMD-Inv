import type { Session } from "@supabase/supabase-js";

import { env } from "@/src/lib/env";
import { supabase } from "@/src/lib/supabase";

export class ApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function formatApiErrorBody(body: string, status: number) {
  if (status === 401) return "Your session expired or you do not have access. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";

  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const detail = parsed.detail ?? parsed.message;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) return String(item.msg);
          return null;
        })
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    // Plain-text responses are handled below.
  }

  return body.trim() || `Request failed with status ${status}.`;
}

async function getToken(session?: Session | null) {
  if (session?.access_token) return session.access_token;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  options?: { session?: Session | null; auth?: boolean }
) {
  const headers = new Headers(init?.headers);
  const shouldAuth = options?.auth !== false;

  if (shouldAuth) {
    const token = await getToken(options?.session);
    if (!token) {
      throw new ApiError("No active Supabase session found.", 401, "");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(formatApiErrorBody(body, response.status), response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string, options?: { session?: Session | null; auth?: boolean }) {
  return apiRequest<T>(path, { method: "GET" }, options);
}

export function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  options?: { session?: Session | null; auth?: boolean }
) {
  return apiRequest<T>(
    path,
    {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    options
  );
}
