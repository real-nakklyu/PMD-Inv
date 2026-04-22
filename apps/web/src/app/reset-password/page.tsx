"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabaseConfigured = hasSupabaseBrowserEnv();

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!supabaseConfigured) {
      setMessage("Supabase is not configured yet.");
      return;
    }
    if (password.length < 8) {
      setMessage("Use at least 8 characters for the new password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The two passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
      return;
    }
    setMessage("Password updated. Redirecting to dashboard...");
    router.push("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md shadow-xl shadow-slate-950/[0.08]">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-lg">Create New Password</CardTitle>
            <p className="text-sm text-muted-foreground">Enter a new password for your PMDInv staff account.</p>
          </div>
        </CardHeader>
        <CardContent>
          {!supabaseConfigured ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              Supabase is not configured yet.
            </div>
          ) : null}
          <form className="space-y-3" onSubmit={updatePassword}>
            <label className="space-y-1 text-sm">
              <span className="font-medium">New Password</span>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Confirm Password</span>
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
            {message ? <p className="text-sm text-rose-600 dark:text-rose-300">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={!supabaseConfigured || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {isSubmitting ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
