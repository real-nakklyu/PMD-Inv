"use client";

import { Clock, LogOut, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";
import type { ProfileMe } from "@/types/domain";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [me, setMe] = useState<ProfileMe | null>(null);
  const [fullName, setFullName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    apiGet<ProfileMe>("/profiles/me").then((data) => {
      setMe(data);
      setFullName((current) => current || data.access_request?.full_name || "");
      setNote((current) => current || data.access_request?.message || "");
      if (data.profile) router.replace("/dashboard");
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load access request.");
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!fullName.trim()) {
      setMessage("Enter your full name so an admin knows who to approve.");
      return;
    }
    setMessage(null);
    try {
      await apiSend("/profiles/access-requests", "POST", {
        full_name: fullName.trim(),
        requested_role: "viewer",
        message: note || null
      });
      setMessage("Approval request submitted.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit approval request.");
    }
  }

  async function signOut() {
    if (!hasSupabaseBrowserEnv()) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Access Pending</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Your PMDInv account is signed in, but a staff profile has not been approved yet. An admin can approve access from the Staff page.
          </p>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Signed in as</div>
            <div>{me?.auth_user.email ?? "Loading..."}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">Request status</div>
            <div>{me?.access_request?.status ?? "No access request found"}</div>
          </div>
          {!me?.access_request || me.access_request.status === "denied" ? (
            <form className="space-y-3 rounded-md border border-border p-3" onSubmit={submitRequest}>
              <div className="text-sm font-medium">Submit approval request</div>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Full Name</span>
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Note for admin</span>
                <Input value={note} placeholder="Role, region, or manager name" onChange={(event) => setNote(event.target.value)} />
              </label>
              <Button type="submit" className="w-full">
                <UserPlus className="h-4 w-4" />
                Submit Request
              </Button>
            </form>
          ) : null}
          {message ? <p className="text-sm text-rose-600 dark:text-rose-300">{message}</p> : null}
          <Button type="button" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
