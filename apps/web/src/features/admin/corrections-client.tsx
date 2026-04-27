"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArchiveRestore,
  CheckCircle2,
  GitMerge,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Wrench
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AsyncSearchPicker, type SearchPickerOption } from "@/components/ui/async-search-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { cn, humanize } from "@/lib/utils";
import {
  floridaRegions,
  type Assignment,
  type CorrectionIssue,
  type CorrectionOverview,
  type Equipment,
  type EquipmentStatus,
  type FloridaRegion,
  type Patient,
  type ProfileMe
} from "@/types/domain";

type AssignmentSearchResult = Assignment & {
  patients?: Pick<Patient, "id" | "full_name" | "date_of_birth" | "region"> | null;
  equipment?: Pick<Equipment, "id" | "serial_number" | "make" | "model" | "equipment_type" | "status" | "region"> | null;
};

const endStatusOptions = ["available", "return_in_progress", "in_repair", "retired"] as const;
const restoreStatusOptions = ["available", "in_repair"] as const;

export function CorrectionsClient() {
  const router = useRouter();
  const [overview, setOverview] = useState<CorrectionOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedAssignment, setSelectedAssignment] = useState<SearchPickerOption | null>(null);
  const [assignmentEndStatus, setAssignmentEndStatus] = useState<(typeof endStatusOptions)[number]>("available");
  const [assignmentNote, setAssignmentNote] = useState("");

  const [regionEquipment, setRegionEquipment] = useState<SearchPickerOption | null>(null);
  const [targetRegion, setTargetRegion] = useState<FloridaRegion>("Tampa");
  const [syncAssignment, setSyncAssignment] = useState(true);
  const [syncPatient, setSyncPatient] = useState(false);
  const [regionNote, setRegionNote] = useState("");

  const [lifecycleEquipment, setLifecycleEquipment] = useState<SearchPickerOption | null>(null);
  const [lifecycleNote, setLifecycleNote] = useState("");
  const [restoreStatus, setRestoreStatus] = useState<(typeof restoreStatusOptions)[number]>("available");
  const [restoreRegion, setRestoreRegion] = useState<FloridaRegion | "keep">("keep");

  const [reconcileEquipment, setReconcileEquipment] = useState<SearchPickerOption | null>(null);
  const [reconcileNote, setReconcileNote] = useState("");

  const [sourcePatient, setSourcePatient] = useState<SearchPickerOption | null>(null);
  const [targetPatient, setTargetPatient] = useState<SearchPickerOption | null>(null);
  const [mergeNote, setMergeNote] = useState("");

  const { toast } = useToast();

  const counts = useMemo(() => overview?.counts ?? {}, [overview?.counts]);
  const criticalCount = overview?.issues.filter((issue) => issue.severity === "critical").length ?? 0;
  const warningCount = overview?.issues.filter((issue) => issue.severity === "warning").length ?? 0;

  const refresh = useCallback(() => {
    if (!canAccess) return;
    setIsLoading(true);
    apiGet<CorrectionOverview>("/corrections/overview")
      .then((data) => {
        setOverview(data);
        setError(null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load correction center."))
      .finally(() => setIsLoading(false));
  }, [canAccess]);

  useEffect(() => {
    let cancelled = false;

    apiGet<ProfileMe>("/profiles/me")
      .then((profile) => {
        if (cancelled) return;

        const isAdmin = profile.profile?.role === "admin";
        setCanAccess(isAdmin);
        if (!isAdmin) {
          toast({
            kind: "error",
            title: "Admin access required",
            description: "Only admin staff can open the Data Correction Center."
          });
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCanAccess(false);
        router.replace("/login");
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingAccess(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, toast]);

  useEffect(() => {
    if (!canAccess) return;
    const handle = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(handle);
  }, [canAccess, refresh]);

  async function runAction<T>(action: string, request: Promise<T>, onSuccess?: () => void) {
    setBusyAction(action);
    setError(null);
    try {
      await request;
      toast({ kind: "success", title: "Correction saved", description: "Audit activity was recorded automatically." });
      onSuccess?.();
      refresh();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Correction failed.";
      setError(description);
      toast({ kind: "error", title: "Correction failed", description });
    } finally {
      setBusyAction(null);
    }
  }

  const metrics = useMemo(() => [
    { label: "Total issues", value: counts.total_issues ?? 0, tone: "primary" },
    { label: "Critical", value: criticalCount, tone: "critical" },
    { label: "Warnings", value: warningCount, tone: "warning" },
    { label: "Active assignments", value: counts.active_assignments ?? 0, tone: "neutral" },
    { label: "Movement mismatches", value: counts.movement_mismatches ?? 0, tone: "warning" },
    { label: "Retired units", value: counts.retired_equipment ?? 0, tone: "neutral" }
  ], [counts, criticalCount, warningCount]);

  if (isCheckingAccess || !canAccess) {
    return (
      <div className="space-y-5">
        <PageHeader title="Data Correction" description="Checking admin access before loading correction tools." />
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Verifying admin permissions...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Data Correction" description="Admin-only tools for controlled operational fixes with audit trails." />

      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Correction Workbench</span>
                <Button type="button" className="h-9 bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={refresh} disabled={isLoading}>
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              <CorrectionPanel
                icon={<PackageCheck className="h-4 w-4" />}
                title="End Assignment"
                description="Use when the Assigned page still shows a patient/unit relationship that should be closed."
              >
                <AsyncSearchPicker
                  label="Active assignment"
                  placeholder="Search patient, serial, make, model, or region"
                  value={selectedAssignment}
                  loadOptions={loadAssignmentOptions}
                  onChange={setSelectedAssignment}
                  disabled={busyAction === "end-assignment"}
                />
                <Select value={assignmentEndStatus} onChange={(event) => setAssignmentEndStatus(event.target.value as typeof assignmentEndStatus)}>
                  {endStatusOptions.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                </Select>
                <Textarea value={assignmentNote} placeholder="Why is this assignment being ended?" onChange={(event) => setAssignmentNote(event.target.value)} />
                <Button
                  type="button"
                  disabled={!selectedAssignment || assignmentNote.trim().length < 3 || busyAction === "end-assignment"}
                  onClick={() => runAction("end-assignment", apiSend("/corrections/end-assignment", "POST", {
                    assignment_id: selectedAssignment?.id,
                    equipment_status: assignmentEndStatus,
                    note: assignmentNote
                  }), () => {
                    setSelectedAssignment(null);
                    setAssignmentNote("");
                  })}
                >
                  {busyAction === "end-assignment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  End assignment
                </Button>
              </CorrectionPanel>

              <CorrectionPanel
                icon={<MapPin className="h-4 w-4" />}
                title="Fix Region"
                description="Correct a unit's current Florida region and optionally sync the active assignment or patient."
              >
                <AsyncSearchPicker
                  label="Equipment"
                  placeholder="Search serial, make, or model"
                  value={regionEquipment}
                  loadOptions={loadEquipmentOptions}
                  onChange={setRegionEquipment}
                  disabled={busyAction === "fix-region"}
                />
                <Select value={targetRegion} onChange={(event) => setTargetRegion(event.target.value as FloridaRegion)}>
                  {floridaRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                </Select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CheckboxLabel checked={syncAssignment} onChange={setSyncAssignment}>Sync active assignment</CheckboxLabel>
                  <CheckboxLabel checked={syncPatient} onChange={setSyncPatient}>Sync active patient</CheckboxLabel>
                </div>
                <Textarea value={regionNote} placeholder="Why is the region being corrected?" onChange={(event) => setRegionNote(event.target.value)} />
                <Button
                  type="button"
                  disabled={!regionEquipment || regionNote.trim().length < 3 || busyAction === "fix-region"}
                  onClick={() => runAction("fix-region", apiSend("/corrections/fix-region", "POST", {
                    equipment_id: regionEquipment?.id,
                    region: targetRegion,
                    note: regionNote,
                    sync_active_assignment: syncAssignment,
                    sync_active_patient: syncPatient
                  }), () => setRegionNote(""))}
                >
                  {busyAction === "fix-region" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  Save region fix
                </Button>
              </CorrectionPanel>

              <CorrectionPanel
                icon={<ArchiveRestore className="h-4 w-4" />}
                title="Retire / Restore Equipment"
                description="Retire a unit without deleting history, or restore a retired/archived unit back into operations."
              >
                <AsyncSearchPicker
                  label="Equipment"
                  placeholder="Search serial, make, model, retired, or archived"
                  value={lifecycleEquipment}
                  loadOptions={loadEquipmentOptions}
                  onChange={setLifecycleEquipment}
                  disabled={busyAction === "retire-equipment" || busyAction === "restore-equipment"}
                />
                <Textarea value={lifecycleNote} placeholder="Reason for retiring or restoring this unit" onChange={(event) => setLifecycleNote(event.target.value)} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    disabled={!lifecycleEquipment || lifecycleNote.trim().length < 3 || busyAction === "retire-equipment"}
                    onClick={() => runAction("retire-equipment", apiSend("/corrections/retire-equipment", "POST", {
                      equipment_id: lifecycleEquipment?.id,
                      note: lifecycleNote,
                      end_active_assignments: true
                    }), () => setLifecycleNote(""))}
                  >
                    {busyAction === "retire-equipment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Retire
                  </Button>
                  <Button
                    type="button"
                    disabled={!lifecycleEquipment || lifecycleNote.trim().length < 3 || busyAction === "restore-equipment"}
                    onClick={() => runAction("restore-equipment", apiSend("/corrections/restore-equipment", "POST", {
                      equipment_id: lifecycleEquipment?.id,
                      status: restoreStatus,
                      region: restoreRegion === "keep" ? null : restoreRegion,
                      note: lifecycleNote
                    }), () => setLifecycleNote(""))}
                  >
                    {busyAction === "restore-equipment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
                    Restore
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={restoreStatus} onChange={(event) => setRestoreStatus(event.target.value as typeof restoreStatus)}>
                    {restoreStatusOptions.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                  </Select>
                  <Select value={restoreRegion} onChange={(event) => setRestoreRegion(event.target.value as FloridaRegion | "keep")}>
                    <option value="keep">Keep current region</option>
                    {floridaRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                  </Select>
                </div>
              </CorrectionPanel>

              <CorrectionPanel
                icon={<Wrench className="h-4 w-4" />}
                title="Reconcile Movement"
                description="Make inventory match the latest movement ledger entry when activity says moved but the unit still shows the old state."
              >
                <AsyncSearchPicker
                  label="Equipment"
                  placeholder="Search serial, make, or model"
                  value={reconcileEquipment}
                  loadOptions={loadEquipmentOptions}
                  onChange={setReconcileEquipment}
                  disabled={busyAction === "reconcile-movement"}
                />
                <Textarea value={reconcileNote} placeholder="Why is movement reconciliation needed?" onChange={(event) => setReconcileNote(event.target.value)} />
                <Button
                  type="button"
                  disabled={!reconcileEquipment || reconcileNote.trim().length < 3 || busyAction === "reconcile-movement"}
                  onClick={() => runAction("reconcile-movement", apiSend("/corrections/reconcile-movement", "POST", {
                    equipment_id: reconcileEquipment?.id,
                    note: reconcileNote
                  }), () => setReconcileNote(""))}
                >
                  {busyAction === "reconcile-movement" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  Reconcile
                </Button>
              </CorrectionPanel>

              <CorrectionPanel
                icon={<GitMerge className="h-4 w-4" />}
                title="Merge Duplicate Patients"
                description="Move assignments, returns, tickets, appointments, notes, and history from the duplicate source into the target patient."
                className="xl:col-span-2"
              >
                <div className="grid gap-3 lg:grid-cols-2">
                  <AsyncSearchPicker
                    label="Duplicate source patient"
                    placeholder="Search patient to archive"
                    value={sourcePatient}
                    loadOptions={loadPatientOptions}
                    onChange={setSourcePatient}
                    disabled={busyAction === "merge-patients"}
                  />
                  <AsyncSearchPicker
                    label="Target patient to keep"
                    placeholder="Search patient to keep"
                    value={targetPatient}
                    loadOptions={loadPatientOptions}
                    onChange={setTargetPatient}
                    disabled={busyAction === "merge-patients"}
                  />
                </div>
                <Textarea value={mergeNote} placeholder="Why are these patient records being merged?" onChange={(event) => setMergeNote(event.target.value)} />
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100">
                  The source patient will be archived. History is moved to the target patient and an audit record is created.
                </div>
                <Button
                  type="button"
                  disabled={!sourcePatient || !targetPatient || sourcePatient.id === targetPatient.id || mergeNote.trim().length < 3 || busyAction === "merge-patients"}
                  onClick={() => runAction("merge-patients", apiSend("/corrections/merge-patients", "POST", {
                    source_patient_id: sourcePatient?.id,
                    target_patient_id: targetPatient?.id,
                    note: mergeNote
                  }), () => {
                    setSourcePatient(null);
                    setTargetPatient(null);
                    setMergeNote("");
                  })}
                >
                  {busyAction === "merge-patients" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                  Merge patients
                </Button>
              </CorrectionPanel>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Issues Detected</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[36rem] space-y-3 overflow-y-auto">
              {isLoading ? <ListSkeleton rows={5} /> : null}
              {!isLoading && overview?.issues.length ? overview.issues.map((issue) => <IssueCard key={issue.id} issue={issue} />) : null}
              {!isLoading && !overview?.issues.length ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No correction issues detected from the current checks.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Admin Corrections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overview?.recent_corrections.length ? overview.recent_corrections.map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">{item.message}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No recent correction-specific activity found yet.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-4 shadow-sm",
      tone === "critical" && "border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30",
      tone === "warning" && "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30",
      tone === "primary" && "border-primary/30 bg-primary/5"
    )}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function CorrectionPanel({
  icon,
  title,
  description,
  className,
  children
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-border bg-background/60 p-4 shadow-sm", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">{icon}</span>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function CheckboxLabel({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5">
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function IssueCard({ issue }: { issue: CorrectionIssue }) {
  return (
    <div className={cn(
      "rounded-md border p-3 text-sm",
      issue.severity === "critical" && "border-red-300 bg-red-50/75 dark:border-red-800 dark:bg-red-950/30",
      issue.severity === "warning" && "border-amber-300 bg-amber-50/75 dark:border-amber-800 dark:bg-amber-950/30",
      issue.severity === "info" && "border-border bg-muted/20"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold">{issue.title}</div>
        <Badge>{issue.severity}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground">{issue.detail}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-muted-foreground">{issue.action}</span>
        {issue.href ? <Link className="text-xs font-semibold text-primary hover:underline" href={issue.href}>Open record</Link> : null}
      </div>
    </div>
  );
}

async function loadEquipmentOptions(query: string) {
  const params = new URLSearchParams({ limit: "12", include_archived: "true" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<Equipment[]>(`/corrections/equipment?${params.toString()}`);
  return items.map((item) => ({
    id: item.id,
    label: `${item.serial_number} - ${item.make} ${item.model}`,
    description: [
      humanize(item.equipment_type),
      humanize(item.status as EquipmentStatus),
      item.region,
      item.archived_at ? "Archived" : null
    ].filter(Boolean).join(" / "),
    region: item.region
  }));
}

async function loadAssignmentOptions(query: string) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<AssignmentSearchResult[]>(`/corrections/active-assignments?${params.toString()}`);
  return items.map((item) => {
    const equipment = item.equipment;
    const patient = item.patients;
    return {
      id: item.id,
      label: `${patient?.full_name ?? "Patient"} / ${equipment?.serial_number ?? "Equipment"}`,
      description: `${equipment?.make ?? ""} ${equipment?.model ?? ""} / ${humanize(item.status)} / ${item.region}`,
      region: item.region
    };
  });
}

async function loadPatientOptions(query: string) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<Patient[]>(`/patients?${params.toString()}`);
  return items.map((item) => ({
    id: item.id,
    label: item.full_name,
    description: `DOB ${new Date(item.date_of_birth).toLocaleDateString()} / ${item.region}`
  }));
}
