import Constants from "expo-constants";

import { apiGet } from "@/src/lib/api";
import { env } from "@/src/lib/env";

type HealthResponse = {
  status: string;
  service?: string;
  version?: string | null;
};

export type BackendHealth = HealthResponse & {
  checked_at: string;
};

export async function fetchBackendHealth() {
  const payload = await apiGet<HealthResponse>("/health", { auth: false });
  return {
    ...payload,
    checked_at: new Date().toISOString(),
  } satisfies BackendHealth;
}

export function getMobileRuntimeSummary() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    appName?: string;
    profile?: string;
  };

  return {
    appName: extra.appName ?? Constants.expoConfig?.name ?? "PMDInv Mobile",
    profile: extra.profile ?? "development",
    version: Constants.expoConfig?.version ?? "1.0.0",
    apiHost: safeHost(env.apiUrl),
    supabaseHost: safeHost(env.supabaseUrl),
    messagingConfigured: Boolean(env.messagingWsUrl),
  };
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
