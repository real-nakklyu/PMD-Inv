"use client";

import { Bell, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiGet, apiSend } from "@/lib/api";
import type { Profile, ProfileMe, StaffAccessRequest, StaffRole } from "@/types/domain";

const roles: StaffRole[] = ["admin", "dispatcher", "technician", "viewer"];

export function StaffClient() {
  const [me, setMe] = useState<ProfileMe | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<StaffAccessRequest[]>([]);
  const [approvalRoles, setApprovalRoles] = useState<Record<string, StaffRole>>({});
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    apiGet<ProfileMe>("/profiles/me").then(setMe).catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load profile."));
    apiGet<Profile[]>("/profiles").then(setProfiles).catch(() => undefined);
    apiGet<StaffAccessRequest[]>("/profiles/access-requests").then((items) => {
      setRequests(items);
      setApprovalRoles(Object.fromEntries(items.map((item) => [item.id, item.requested_role])));
    }).catch(() => undefined);
  }

  useEffect(refresh, []);

  async function bootstrap() {
    setMessage(null);
    try {
      await apiSend<Profile>("/profiles/bootstrap-first-admin", "POST", { full_name: fullName });
      setFullName("");
      setMessage("First admin profile created.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to bootstrap admin.");
    }
  }

  async function updateRole(profile: Profile, role: StaffRole) {
    setMessage(null);
    try {
      await apiSend<Profile>(`/profiles/${profile.id}`, "PATCH", { role });
      setMessage("Role updated.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update role.");
    }
  }

  async function reviewRequest(request: StaffAccessRequest, action: "approve" | "deny") {
    setMessage(null);
    try {
      await apiSend<StaffAccessRequest>(`/profiles/access-requests/${request.id}`, "PATCH", {
        action,
        role: approvalRoles[request.id] ?? request.requested_role
      });
      setMessage(action === "approve" ? "Access request approved." : "Access request denied.");
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review request.");
    }
  }

  const myProfileId = me?.profile?.id;

  return (
    <>
      <PageHeader title="Staff" description="Map Supabase Auth users to PMDInv staff roles for internal access control." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCog className="h-4 w-4" /> Staff Profiles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profiles.length ? profiles.map((profile) => (
              <div key={profile.id} className="flex flex-col gap-3 border-b border-border pb-3 last:border-0 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{profile.full_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{profile.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{profile.role}</Badge>
                  <Select
                    className="w-40"
                    value={profile.role}
                    disabled={profile.id === myProfileId && profile.role === "admin"}
                    title={profile.id === myProfileId && profile.role === "admin" ? "Admins cannot remove their own admin role." : undefined}
                    onChange={(event) => updateRole(profile, event.target.value as StaffRole)}
                  >
                    {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </Select>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No profiles loaded. If this is the first user, create the first admin profile.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Bell className="h-4 w-4" /> Pending Access Requests</span>
                {requests.length ? <Badge>{requests.length} pending</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {requests.length ? requests.map((request) => (
                <div key={request.id} className="space-y-3 rounded-md border border-border p-3">
                  <div>
                    <div className="font-medium">{request.full_name}</div>
                    <div className="text-xs text-muted-foreground">{request.email}</div>
                    {request.message ? <div className="mt-2 text-sm">{request.message}</div> : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      className="sm:w-40"
                      value={approvalRoles[request.id] ?? request.requested_role}
                      onChange={(event) => setApprovalRoles((current) => ({ ...current, [request.id]: event.target.value as StaffRole }))}
                    >
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </Select>
                    <Button type="button" onClick={() => reviewRequest(request, "approve")}>Approve</Button>
                    <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => reviewRequest(request, "deny")}>Deny</Button>
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground">No pending access requests.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> My Access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Auth user</div>
                <div>{me?.auth_user.email ?? "Sign in to Supabase Auth first."}</div>
              </div>
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">Profile</div>
                <div>{me?.profile ? <Badge>{me.profile.role}</Badge> : "No staff profile yet."}</div>
              </div>
              {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>First Admin Bootstrap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Only works before any staff profiles exist. After that, admins manage roles here.</p>
              <Input value={fullName} placeholder="Your full name" onChange={(event) => setFullName(event.target.value)} />
              <Button type="button" onClick={bootstrap} disabled={!fullName.trim() || !me?.can_bootstrap_admin}>Create First Admin</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
