"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiSend } from "@/lib/api";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

const pendingRequestKey = "pmdinv.pendingAccessRequest";

type PendingAccessRequest = {
  full_name: string;
  requested_role: "viewer";
  message: string | null;
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [nextPath, setNextPath] = useState("/dashboard");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(() => initialLoginMessage());
  const supabaseConfigured = hasSupabaseBrowserEnv();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Browser URL params decide the initial auth tab and post-login destination.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNextPath(params.get("next") || "/dashboard");
    if (params.get("mode") === "signup") setMode("signup");
    if (params.get("mode") === "forgot") setMode("forgot");
  }, []);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    if (!supabaseConfigured) {
      setMessage("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to apps/web/.env.local, then restart the dev server.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }
    const pendingRequest = readPendingAccessRequest();
    if (pendingRequest) {
      try {
        await apiSend("/profiles/access-requests", "POST", pendingRequest);
        window.localStorage.removeItem(pendingRequestKey);
        router.push("/pending-approval");
        return;
      } catch (requestError) {
        setMessage(requestError instanceof Error ? requestError.message : "Signed in, but the approval request could not be submitted.");
        setIsSubmitting(false);
        return;
      }
    }
    router.push(nextPath);
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    if (!supabaseConfigured) {
      setMessage("Supabase is not configured yet.");
      setIsSubmitting(false);
      return;
    }
    if (!fullName.trim()) {
      setMessage("Enter your full name so an admin knows who to approve.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }
    const requestPayload: PendingAccessRequest = {
      full_name: fullName.trim(),
      requested_role: "viewer",
      message: note || null
    };
    window.localStorage.setItem(pendingRequestKey, JSON.stringify(requestPayload));

    if (!data.session) {
      setMessage("Account created. Confirm your email if Supabase asks you to, then sign in. Your approval request will be submitted after sign-in.");
      setMode("signin");
      setIsSubmitting(false);
      return;
    }

    try {
      await apiSend("/profiles/access-requests", "POST", requestPayload);
      window.localStorage.removeItem(pendingRequestKey);
      router.push("/pending-approval");
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : "Account created, but the approval request could not be submitted.");
      setIsSubmitting(false);
    }
  }

  async function sendPasswordReset(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    if (!supabaseConfigured) {
      setMessage("Supabase is not configured yet.");
      setIsSubmitting(false);
      return;
    }
    if (!email.trim()) {
      setMessage("Enter your email address first.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });
    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }
    setMessage("Password reset email sent. Open the link in that email to choose a new password.");
    setIsSubmitting(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md shadow-xl shadow-slate-950/[0.08]">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-lg">{mode === "signin" ? "Staff Login" : mode === "signup" ? "Request Staff Access" : "Reset Password"}</CardTitle>
            <p className="text-sm text-muted-foreground">Secure internal access for Florida DME operations.</p>
          </div>
        </CardHeader>
        <CardContent>
          {!supabaseConfigured ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Supabase is not configured yet. The demo UI can load, but staff login needs frontend Supabase environment variables.
            </div>
          ) : null}
          <div className="mb-5 grid grid-cols-2 rounded-md border border-border bg-muted/40 p-1">
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${mode === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"}`}
              onClick={() => {
                setMode("signin");
                setMessage(null);
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`rounded px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${mode === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary"}`}
              onClick={() => {
                setMode("signup");
                setMessage(null);
              }}
            >
              Sign up
            </button>
          </div>
          <form className="space-y-3" onSubmit={mode === "signin" ? signIn : mode === "signup" ? signUp : sendPasswordReset}>
            {mode === "signup" ? (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Full Name</span>
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="font-medium">Email</span>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {mode !== "forgot" ? (
              <div className="space-y-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Password</span>
                  <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
                {mode === "signin" ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-primary transition hover:text-primary/80 active:translate-y-px"
                    onClick={() => {
                      setMode("forgot");
                      setMessage(null);
                    }}
                  >
                    Forgot password?
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/35 p-3 text-sm text-muted-foreground">
                Enter your staff email and we will send a secure reset link.
              </p>
            )}
            {mode === "signup" ? (
              <label className="space-y-1 text-sm">
                <span className="font-medium">Note for admin</span>
                <Input value={note} placeholder="Role, region, or manager name" onChange={(event) => setNote(event.target.value)} />
              </label>
            ) : null}
            {message ? <p className="text-sm text-rose-600 dark:text-rose-300">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={!supabaseConfigured || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? <UserPlus className="h-4 w-4" /> : mode === "forgot" ? <KeyRound className="h-4 w-4" /> : null}
              {isSubmitting ? "Working..." : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account & Request Approval" : "Send Reset Email"}
            </Button>
            {mode === "forgot" ? (
              <button
                type="button"
                className="w-full text-center text-sm font-medium text-muted-foreground transition hover:text-foreground active:translate-y-px"
                onClick={() => {
                  setMode("signin");
                  setMessage(null);
                }}
              >
                Back to sign in
              </button>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function readPendingAccessRequest(): PendingAccessRequest | null {
  try {
    const raw = window.localStorage.getItem(pendingRequestKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAccessRequest>;
    if (!parsed.full_name) return null;
    return {
      full_name: parsed.full_name,
      requested_role: "viewer",
      message: parsed.message ?? null
    };
  } catch {
    return null;
  }
}

function initialLoginMessage() {
  if (typeof window === "undefined") return null;
  const reason = new URLSearchParams(window.location.search).get("reason");
  if (reason === "session_expired") return "Your session expired. Please sign in again to continue.";
  return null;
}
