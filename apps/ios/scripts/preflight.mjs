import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const envPath = resolve(cwd, ".env");

loadLocalEnv(envPath);

const requiredKeys = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

const missing = requiredKeys.filter((key) => !process.env[key]);

console.log("PMDInv iPhone preflight");
console.log("=======================");

if (!existsSync(envPath)) {
  console.log("- Missing apps/ios/.env");
  console.log("  Copy .env.example or .env.iphone.example to .env before starting Expo.");
  process.exitCode = 1;
} else {
  console.log(`- Found local env file: ${envPath}`);
}

if (missing.length) {
  console.log(`- Missing required environment variables: ${missing.join(", ")}`);
  process.exitCode = 1;
}

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const messagingWsUrl = process.env.EXPO_PUBLIC_MESSAGING_WS_URL;

if (apiUrl) {
  console.log(`- API host: ${safeHost(apiUrl)}`);
}

if (supabaseUrl) {
  console.log(`- Supabase host: ${safeHost(supabaseUrl)}`);
}

if (anonKey) {
  console.log(`- Supabase anon key loaded: yes (${anonKey.length} chars)`);
}

console.log(`- Messaging websocket configured: ${messagingWsUrl ? "yes" : "no"}`);

if (apiUrl) {
  await checkApiHealth(apiUrl);
}

checkEasLogin();

if (process.exitCode && process.exitCode !== 0) {
  console.log("");
  console.log("Preflight finished with blockers.");
  process.exit(process.exitCode);
}

console.log("");
console.log("Preflight passed.");
console.log("Next steps:");
console.log("- Quickest device test: pnpm --filter @pmdinv/ios start:tunnel");
console.log("- Installable iPhone build: cd apps/ios && pnpm eas:ios:preview");

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function checkApiHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/health`);
    if (!response.ok) {
      console.log(`- API health check failed with status ${response.status}`);
      process.exitCode = 1;
      return;
    }

    const payload = await response.json();
    console.log(`- API health check: ${payload.status ?? "ok"} (${payload.service ?? "service"})`);
  } catch (error) {
    console.log(`- API health check failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

function checkEasLogin() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["exec", "eas", "whoami"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status === 0) {
    const output = result.stdout.trim();
    console.log(`- EAS login: ${output || "logged in"}`);
    return;
  }

  console.log("- EAS login: not logged in yet");
  console.log("  Expo Go still works now, but installable preview/production builds need `pnpm exec eas login`.");
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}
