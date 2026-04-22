"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";
import type { ProfileMe } from "@/types/domain";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [message, setMessage] = useState("Checking access...");

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      if (!hasSupabaseBrowserEnv()) {
        setMessage("Supabase browser environment is not configured.");
        setAllowed(false);
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      try {
        const me = await apiGet<ProfileMe>("/profiles/me");
        if (!active) return;
        if (me.profile || (me.can_bootstrap_admin && pathname.startsWith("/staff"))) {
          setAllowed(true);
          return;
        }
        router.replace("/pending-approval");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Unable to verify access.");
      }
    }

    checkAccess();
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (allowed) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {message}
      </div>
    </main>
  );
}
