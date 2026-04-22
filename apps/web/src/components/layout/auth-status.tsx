"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";

export function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const supabaseConfigured = hasSupabaseBrowserEnv();

  useEffect(() => {
    if (!supabaseConfigured) return;

    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => subscription.subscription.unsubscribe();
  }, [supabaseConfigured]);

  async function signOut() {
    if (!supabaseConfigured) return;

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setEmail(null);
    router.push("/login");
  }

  if (!supabaseConfigured) {
    return (
      <span className="hidden rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 sm:inline-flex">
        Supabase env not set
      </span>
    );
  }

  if (!email) {
    return (
      <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold shadow-sm transition hover:bg-secondary active:translate-y-px" href="/login">
        <UserCircle className="h-4 w-4" />
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-48 truncate rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm sm:inline">{email}</span>
      <Button type="button" className="h-10 w-10 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Sign out" onClick={signOut}>
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
