"use client";

import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api";
const localApiBase = "/api";

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
  if (!response.ok) throw new Error(await response.text());
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
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
