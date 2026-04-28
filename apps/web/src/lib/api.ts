"use client";

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";
const localApiBase = "/api";

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

export function formatApiErrorBody(body: string, status: number): string {
  if (status === 401) return "Your session expired or you do not have access. Please sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";

  try {
    const parsed = JSON.parse(body) as { detail?: unknown; message?: unknown };
    const detail = parsed.detail ?? parsed.message;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
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

  const trimmed = body.trim();
  return trimmed || `Request failed with status ${status}.`;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!hasSupabaseBrowserEnv()) return {};

  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      headers,
      cache: "no-store"
    });
  } catch (error) {
    if (!path.startsWith("/profiles") || apiBase === localApiBase) throw error;
    response = await fetch(`${localApiBase}${path}`, {
      headers,
      cache: "no-store"
    });
  }
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(formatApiErrorBody(body, response.status), response.status, body);
  }
  return response.json() as Promise<T>;
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    if (!path.startsWith("/profiles") || apiBase === localApiBase) throw error;
    response = await fetch(`${localApiBase}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(formatApiErrorBody(body, response.status), response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
