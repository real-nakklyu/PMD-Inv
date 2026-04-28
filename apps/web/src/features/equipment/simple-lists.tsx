"use client";

import Link from "next/link";
import { ArrowRight, Download, ExternalLink, History, Loader2, MapPin, MessageSquarePlus, Plus, Printer, Route, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EquipmentQrLabel } from "@/components/operations/qr-label";
import { AttachmentUploader } from "@/components/storage/attachment-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { ticketDisplayNumber } from "@/lib/tickets";
import { currency, humanize, pluralize } from "@/lib/utils";
import { floridaRegions } from "@/types/domain";
import type { ActivityLog, Assignment, Equipment, EquipmentCostEvent, EquipmentDetailData, EquipmentLocationType, EquipmentMovement, EquipmentMovementType, FloridaRegion, Patient, PatientDetailData, PatientNote, PreventiveMaintenanceTask, ReturnRecord, ServiceTicket } from "@/types/domain";
import { ReturnInspectionChecklist, ReturnStatusControl } from "@/features/workflows/workflow-forms";

export function AssignedList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  useEffect(() => {
    apiGet<Assignment[]>("/assignments?status=active").then((items) => {
      setAssignments(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load assignments.");
    }).finally(() => setIsLoading(false));
  }, [refreshKey]);
  function exportAssignments() {
    downloadCsv(
      `pmdinv-assignments-${new Date().toISOString().slice(0, 10)}.csv`,
      assignments.map((item) => ({
        patient: item.patients?.full_name ?? item.patient_id,
        date_of_birth: item.patients?.date_of_birth ?? "",
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        region: item.region,
        status: humanize(item.status),
        assigned_at: item.assigned_at,
        ended_at: item.ended_at ?? "",
        notes: item.notes ?? ""
      }))
    );
    toast({ kind: "success", title: "Assignments CSV downloaded", description: `${pluralize(assignments.length, "record")} exported.` });
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Current Assignments</CardTitle>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={exportAssignments}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <LoadError message={error} /> : null}
        {isLoading ? <ListSkeleton rows={4} /> : assignments.length ? assignments.map((item) => (
          <div key={item.id} className="flex flex-col justify-between gap-2 border-b border-border pb-3 last:border-0 md:flex-row md:items-center">
            <div>
              <div className="font-medium">{item.patients?.full_name ?? `${item.region} assignment`}</div>
              <div className="text-sm text-muted-foreground">
                {equipmentLabel(item.equipment, item.equipment_id)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge>{item.status}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(item.assigned_at).toLocaleDateString()}</span>
            </div>
          </div>
        )) : <EmptyState message="No active assignments loaded." />}
      </CardContent>
    </Card>
  );
}

export function ReturnsList({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReturnRecord | null>(null);
  const { toast } = useToast();
  function refresh() {
    setIsLoading(true);
    apiGet<ReturnRecord[]>("/returns").then((items) => {
      setReturns(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load returns.");
    }).finally(() => setIsLoading(false));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refreshKey]);
  function exportReturns() {
    downloadCsv(
      `pmdinv-returns-${new Date().toISOString().slice(0, 10)}.csv`,
      returns.map((item) => ({
        patient: item.patients?.full_name ?? item.patient_id,
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        status: humanize(item.status),
        requested_at: item.requested_at,
        scheduled_at: item.scheduled_at ?? "",
        received_at: item.received_at ?? "",
        closed_at: item.closed_at ?? "",
        pickup_address: item.pickup_address ?? "",
        notes: item.notes ?? ""
      }))
    );
    toast({ kind: "success", title: "Returns CSV downloaded", description: `${pluralize(returns.length, "record")} exported.` });
  }
  async function deleteReturn(item: ReturnRecord) {
    try {
      await apiSend(`/returns/${item.id}`, "DELETE");
      toast({ kind: "success", title: "Return deleted" });
      setPendingDelete(null);
      refresh();
      onChanged?.();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Unable to delete return.";
      setError(description);
      toast({ kind: "error", title: "Could not delete return", description });
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Return Workflow</CardTitle>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={exportReturns}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <LoadError message={error} /> : null}
        {isLoading ? <ListSkeleton rows={4} /> : returns.length ? returns.map((item) => (
          <div key={item.id} className="grid gap-2 border-b border-border pb-3 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.patients?.full_name ?? `Return ${item.id}`}</span>
                {isOverdueReturn(item) ? <Badge className="border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">Overdue</Badge> : null}
              </div>
              <div className="text-sm text-muted-foreground">
                Requested {new Date(item.requested_at).toLocaleDateString()} for {equipmentLabel(item.equipment, item.equipment_id)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge>{item.status}</Badge>
                <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete return" onClick={() => setPendingDelete(item)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <ReturnStatusControl record={item} onSaved={() => {
                refresh();
                onChanged?.();
              }} />
            </div>
            {["received", "inspected"].includes(item.status) ? (
              <div className="md:col-span-2">
                <ReturnInspectionChecklist record={item} onSaved={refresh} />
              </div>
            ) : null}
            <div className="md:col-span-2">
              <AttachmentUploader scope="return" ownerId={item.id} label="Pickup / return documents" accept="image/*,.pdf,.doc,.docx" />
            </div>
          </div>
        )) : <EmptyState message="No return workflows loaded." />}
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete return workflow?"
          description={`Are you sure you want to delete this return workflow${pendingDelete?.patients?.full_name ? ` for ${pendingDelete.patients.full_name}` : ""}?`}
          confirmLabel="Delete return"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => pendingDelete ? deleteReturn(pendingDelete) : undefined}
        />
      </CardContent>
    </Card>
  );
}

export function TicketsList({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ServiceTicket | null>(null);
  const { toast } = useToast();
  function refresh() {
    setIsLoading(true);
    apiGet<ServiceTicket[]>("/service-tickets").then((items) => {
      setTickets(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load service tickets.");
    }).finally(() => setIsLoading(false));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refreshKey]);
  function exportTickets() {
    downloadCsv(
      `pmdinv-service-tickets-${new Date().toISOString().slice(0, 10)}.csv`,
      tickets.map((item) => ({
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        patient: item.patients?.full_name ?? item.patient_id ?? "",
        priority: humanize(item.priority),
        status: humanize(item.status),
        issue_description: item.issue_description,
        repair_completed: item.repair_completed ? "Yes" : "No",
        repair_notes: item.repair_notes ?? "",
        opened_at: item.opened_at,
        resolved_at: item.resolved_at ?? "",
        closed_at: item.closed_at ?? ""
      }))
    );
    toast({ kind: "success", title: "Service tickets CSV downloaded", description: `${pluralize(tickets.length, "record")} exported.` });
  }
  async function deleteTicket(ticket: ServiceTicket) {
    try {
      await apiSend(`/service-tickets/${ticket.id}`, "DELETE");
      toast({ kind: "success", title: "Service ticket deleted", description: ticketDisplayNumber(ticket) });
      setPendingDelete(null);
      refresh();
      onChanged?.();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Unable to delete service ticket.";
      setError(description);
      toast({ kind: "error", title: "Could not delete ticket", description });
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Service Tickets</CardTitle>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={exportTickets}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <LoadError message={error} /> : null}
        {isLoading ? <ListSkeleton rows={4} /> : tickets.length ? tickets.map((item) => (
          <div key={item.id} className="grid gap-2 border-b border-border pb-3 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{ticketDisplayNumber(item)}</span>
                {item.priority === "urgent" || item.priority === "high" ? <Badge>{item.priority}</Badge> : null}
              </div>
              <div className="text-sm text-muted-foreground">
                {equipmentLabel(item.equipment, item.equipment_id)} opened {new Date(item.opened_at).toLocaleDateString()}
              </div>
              <div className="mt-1 line-clamp-1 text-sm">{item.issue_description}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Badge>{item.priority}</Badge>
              <Badge>{item.status}</Badge>
              <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/service-tickets/${item.id}`}>
                Open <ExternalLink className="h-3 w-3" />
              </Link>
              <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete ticket" onClick={() => setPendingDelete(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )) : <EmptyState message="No service tickets loaded." />}
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete service ticket?"
          description={`Are you sure you want to delete ${pendingDelete ? ticketDisplayNumber(pendingDelete) : "this ticket"}? This removes its update history too.`}
          confirmLabel="Delete ticket"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => pendingDelete ? deleteTicket(pendingDelete) : undefined}
        />
      </CardContent>
    </Card>
  );
}

export function PatientsList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Patient | null>(null);
  const { toast } = useToast();
  function refresh() {
    setIsLoading(true);
    apiGet<Patient[]>("/patients").then((items) => {
      setPatients(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load patients.");
    }).finally(() => setIsLoading(false));
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refreshKey]);
  async function deletePatient(item: Patient) {
    try {
      const result = await apiSend<{ action: "deleted" | "archived"; message: string }>(`/patients/${item.id}`, "DELETE");
      toast({
        kind: "success",
        title: result.action === "archived" ? "Patient archived" : "Patient deleted",
        description: result.action === "archived" ? `${item.full_name} was removed from active patients.` : item.full_name
      });
      setError(null);
      setPendingDelete(null);
      refresh();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Unable to delete patient.";
      setError(description);
      toast({ kind: "error", title: "Could not delete patient", description });
    }
  }
  return (
    <Card>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {error ? <div className="md:col-span-2 xl:col-span-3"><LoadError message={error} /></div> : null}
        {isLoading ? <div className="md:col-span-2 xl:col-span-3"><ListSkeleton rows={6} /></div> : patients.length ? patients.map((item) => {
          const address = patientAddress(item);
          return (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <Link className="font-medium text-primary hover:underline" href={`/patients/${item.id}`}>{item.full_name}</Link>
                <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete patient" onClick={() => setPendingDelete(item)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">DOB {new Date(item.date_of_birth).toLocaleDateString()}</div>
              <div className="mt-3 flex items-start gap-2 whitespace-pre-wrap text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{address || "No address recorded"}</span>
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span>{item.region}</span>
                <span className="text-muted-foreground">History ready</span>
              </div>
            </div>
          );
        }) : <EmptyState message="No patients loaded." />}
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete patient?"
          description={`Are you sure you want to delete ${pendingDelete?.full_name ?? "this patient"}? If workflow history references them, they will be archived so records stay intact.`}
          confirmLabel="Delete patient"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => pendingDelete ? deletePatient(pendingDelete) : undefined}
        />
      </CardContent>
    </Card>
  );
}

export function EquipmentDetail({ id, movementPrefill = "" }: { id: string; movementPrefill?: string }) {
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [detail, setDetail] = useState<EquipmentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const refreshDetail = useCallback(() => {
    apiGet<Equipment>(`/equipment/${id}`).then((item) => {
      setEquipment(item);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load equipment.");
    });
    apiGet<EquipmentDetailData>(`/equipment/${id}/detail`).then((data) => {
      setDetail(data);
      setEquipment(data.equipment);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load equipment detail.");
    });
  }, [id]);
  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);
  if (!equipment) {
    return error ? <LoadError message={error} /> : <DetailSkeleton />;
  }
  const currentAssignment = detail?.assignments.find((item) => item.status === "active" || item.status === "return_in_progress");
  const activity = detail?.activity ?? [];
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{equipment.make} {equipment.model}</CardTitle>
              <Button type="button" className="print:hidden bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Detail label="Serial" value={equipment.serial_number} />
            <Detail label="Type" value={humanize(equipment.equipment_type)} />
            <Detail label="Status" value={<Badge>{equipment.status}</Badge>} />
            <Detail label="Region" value={equipment.region} />
            <Detail label="Added" value={new Date(equipment.added_at).toLocaleString()} />
            <Detail label="Assigned" value={equipment.assigned_at ? new Date(equipment.assigned_at).toLocaleString() : "Not assigned"} />
            <Detail label="Completed repairs" value={detail?.repair_count ?? "Connect API for count"} />
            <div className="md:col-span-2">
              <Detail label="Notes" value={equipment.notes ?? "No notes recorded"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current Patient</CardTitle>
          </CardHeader>
          <CardContent>
            {currentAssignment?.patients ? (
              <div className="space-y-3 text-sm">
                <Link className="text-base font-semibold text-primary hover:underline" href={`/patients/${currentAssignment.patient_id}`}>
                  {currentAssignment.patients.full_name}
                </Link>
                <div className="text-muted-foreground">DOB {new Date(currentAssignment.patients.date_of_birth).toLocaleDateString()}</div>
                <div className="text-muted-foreground">Region {currentAssignment.patients.region}</div>
                <div className="text-muted-foreground">Assigned {new Date(currentAssignment.assigned_at).toLocaleString()}</div>
              </div>
            ) : <p className="text-sm text-muted-foreground">This equipment is not currently assigned.</p>}
          </CardContent>
        </Card>
        <MovementLedger key={`${equipment.id}:${equipment.region}:${equipment.status}:${movementPrefill}`} equipment={equipment} movements={detail?.movements ?? []} movementPrefill={movementPrefill} onChanged={refreshDetail} />
        <MaintenanceHistory tasks={detail?.maintenance ?? []} />
        <CostHistory events={detail?.cost_events ?? []} />
        <HistoryCard title="Assignment History" items={detail?.assignments ?? []} empty="No assignment history loaded." />
        <HistoryCard title="Return History" items={detail?.returns ?? []} empty="No return history loaded." />
        <HistoryCard title="Service History" items={detail?.service_tickets ?? []} empty="No service ticket history loaded." />
        <Card>
          <CardHeader>
            <CardTitle>Damage Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <AttachmentUploader scope="equipment-damage" ownerId={equipment.id} label="Damage photos / condition documents" accept="image/*,.pdf" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Label</CardTitle>
          </CardHeader>
          <CardContent>
            <EquipmentQrLabel equipmentId={equipment.id} serialNumber={equipment.serial_number} make={equipment.make} model={equipment.model} />
          </CardContent>
        </Card>
      </div>
      <Button
        type="button"
        className="fixed bottom-5 right-5 z-40 h-12 rounded-md border border-primary/25 bg-primary px-4 text-primary-foreground shadow-xl shadow-primary/20 hover:bg-primary/90 print:hidden"
        onClick={() => setIsTimelineOpen(true)}
      >
        <History className="h-4 w-4" />
        Timeline
        <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs">{activity.length}</span>
      </Button>
      <EquipmentTimelineDrawer
        open={isTimelineOpen}
        equipment={equipment}
        activity={activity}
        assignments={detail?.assignments ?? []}
        onClose={() => setIsTimelineOpen(false)}
      />
    </>
  );
}

function EquipmentTimelineDrawer({
  open,
  equipment,
  activity,
  assignments,
  onClose
}: {
  open: boolean;
  equipment: Equipment;
  activity: ActivityLog[];
  assignments: EquipmentDetailData["assignments"];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby="equipment-timeline-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-sm"
        aria-label="Close timeline"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-card shadow-2xl shadow-slate-950/30">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <History className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Equipment timeline</span>
            </div>
            <h2 id="equipment-timeline-title" className="mt-2 truncate text-lg font-semibold">
              {equipment.serial_number} - {equipment.make} {equipment.model}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Audit history, assignments, workflow updates, and operational events.</p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground transition hover:bg-background hover:text-foreground"
            onClick={onClose}
            aria-label="Close timeline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4 text-sm">
            {activity.length ? activity.map((item) => (
              <div key={item.id} className="relative border-l-2 border-primary/35 pb-1 pl-4">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{item.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-2 font-medium"><ActivityMessage item={item} assignments={assignments} /></div>
                <AuditChanges item={item} />
              </div>
            )) : (
              <>
                <div className="relative border-l-2 border-primary/35 pl-4">
                  <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="font-medium">Equipment added to {equipment.region}</div>
                  <div className="text-xs text-muted-foreground">{new Date(equipment.added_at).toLocaleString()}</div>
                </div>
                {equipment.assigned_at ? (
                  <div className="relative border-l-2 border-primary/35 pl-4">
                    <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                    <div className="font-medium">Assigned</div>
                    <div className="text-xs text-muted-foreground">{new Date(equipment.assigned_at).toLocaleString()}</div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

const movementTypes: EquipmentMovementType[] = [
  "received_into_inventory",
  "warehouse_to_driver",
  "driver_to_patient",
  "patient_to_return",
  "return_to_warehouse",
  "warehouse_to_repair",
  "repair_to_warehouse",
  "region_transfer",
  "manual_adjustment",
  "retired"
];

const locationTypes: EquipmentLocationType[] = [
  "warehouse",
  "driver",
  "patient",
  "repair",
  "return_in_transit",
  "retired",
  "unknown"
];

type MovementFormState = {
  movement_type: EquipmentMovementType;
  from_location_type: EquipmentLocationType;
  from_location_label: string;
  from_region: "" | FloridaRegion;
  to_location_type: EquipmentLocationType;
  to_location_label: string;
  to_region: "" | FloridaRegion;
  patient_id: string;
  moved_at: string;
  notes: string;
};

function MovementLedger({ equipment, movements, movementPrefill, onChanged }: { equipment: Equipment; movements: EquipmentMovement[]; movementPrefill?: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<MovementFormState>(() => initialMovementForm(equipment, movementPrefill));
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const destinationPatients = patients.filter((patient) => !form.to_region || patient.region === form.to_region);
  const movementValidationMessage = getMovementValidationMessage(equipment, form);

  const loadPatients = useCallback(() => {
    if (patients.length || isLoadingPatients) return;
    setIsLoadingPatients(true);
    apiGet<Patient[]>("/patients?limit=200").then((items) => {
      setPatients(items);
      setPatientsError(null);
    }).catch((reason) => {
      setPatientsError(reason instanceof Error ? reason.message : "Unable to load patients.");
    }).finally(() => setIsLoadingPatients(false));
  }, [isLoadingPatients, patients.length]);

  useEffect(() => {
    if (form.to_location_type !== "patient") return;
    void Promise.resolve().then(loadPatients);
  }, [form.to_location_type, loadPatients]);

  async function createMovement() {
    if (movementValidationMessage) {
      toast({ kind: "error", title: "Movement needs correction", description: movementValidationMessage });
      return;
    }

    setIsCreating(true);
    try {
      await apiSend<EquipmentMovement>("/equipment-movements", "POST", {
        equipment_id: equipment.id,
        movement_type: form.movement_type,
        from_location_type: form.from_location_type,
        from_location_label: nullableText(form.from_location_label),
        from_region: form.from_region || null,
        to_location_type: form.to_location_type,
        to_location_label: nullableText(form.to_location_label),
        to_region: form.to_region || null,
        patient_id: form.patient_id || null,
        moved_at: form.moved_at ? new Date(form.moved_at).toISOString() : null,
        notes: nullableText(form.notes)
      });
      toast({ kind: "success", title: "Movement recorded", description: "The equipment chain of custody was updated." });
      setForm(initialMovementForm(equipment, movementPrefill));
      onChanged();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to record movement.";
      toast({
        kind: "error",
        title: "Could not record movement",
        description: message.includes("equipment_movements") ? "Run the 010 equipment movement ledger migration in Supabase, then try again." : message
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Movement Ledger</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Chain of custody for warehouse, driver, patient, return, repair, and region transfers.</p>
          </div>
          <Badge className="w-fit border-primary/25 bg-primary/10 text-primary">{pluralize(movements.length, "event")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {movements.length ? movements.map((movement) => (
            <div key={movement.id} className="rounded-md border border-border bg-card p-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{humanize(movement.movement_type)}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(movement.moved_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <LocationPill type={movement.from_location_type} label={movement.from_location_label} region={movement.from_region} />
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <LocationPill type={movement.to_location_type} label={movement.to_location_label} region={movement.to_region} />
                  </div>
                  {movement.patient_id && movement.patients?.full_name ? (
                    <Link className="mt-3 inline-flex text-sm font-medium text-primary hover:underline" href={`/patients/${movement.patient_id}`}>
                      {movement.patients.full_name}
                    </Link>
                  ) : null}
                  {movement.notes ? <p className="mt-2 text-sm text-muted-foreground">{movement.notes}</p> : null}
                </div>
                <Route className="hidden h-5 w-5 text-primary sm:block" />
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              No movements recorded yet. New delivery completions and manual entries will appear here.
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-4">
          <div className="mb-4">
            <div className="font-semibold">Record Movement</div>
            <p className="text-sm text-muted-foreground">Use this for manual custody changes that happen outside a scheduled delivery.</p>
          </div>
          <div className="grid gap-3">
            <label className="space-y-1.5 text-sm font-medium">
              Movement type
              <Select value={form.movement_type} onChange={(event) => setForm((current) => ({ ...current, movement_type: event.target.value as EquipmentMovementType }))}>
                {movementTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                From
                <Select value={form.from_location_type} onChange={(event) => setForm((current) => ({ ...current, from_location_type: event.target.value as EquipmentLocationType }))}>
                  {locationTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
                </Select>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                To
                <Select value={form.to_location_type} onChange={(event) => {
                  if (event.target.value === "patient") loadPatients();
                  setForm((current) => ({
                    ...current,
                    to_location_type: event.target.value as EquipmentLocationType,
                    patient_id: event.target.value === "patient" ? current.patient_id : "",
                    to_location_label: event.target.value === "patient" ? current.to_location_label : current.to_location_label
                  }));
                }}>
                  {locationTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
                </Select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Input value={form.from_location_label} placeholder="From label, driver, shelf..." onChange={(event) => setForm((current) => ({ ...current, from_location_label: event.target.value }))} />
              <Input value={form.to_location_label} placeholder="To label, driver, patient home..." onChange={(event) => setForm((current) => ({ ...current, to_location_label: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                From region
                <Select value={equipment.region} disabled onChange={(event) => setForm((current) => ({ ...current, from_region: event.target.value as "" | FloridaRegion }))}>
                  {floridaRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                </Select>
                <span className="block text-xs font-normal text-muted-foreground">Locked to the current inventory region.</span>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                To region
                <Select value={form.to_region} onChange={(event) => setForm((current) => {
                  const nextRegion = event.target.value as "" | FloridaRegion;
                  const selectedPatient = patients.find((patient) => patient.id === current.patient_id);
                  return {
                    ...current,
                    to_region: nextRegion,
                    patient_id: selectedPatient && selectedPatient.region === nextRegion ? current.patient_id : "",
                    to_location_label: selectedPatient && selectedPatient.region === nextRegion ? current.to_location_label : ""
                  };
                })}>
                  <option value="">Not set</option>
                  {floridaRegions.map((region) => (
                    <option key={region} value={region} disabled={form.movement_type === "region_transfer" && region === equipment.region}>
                      {region}{form.movement_type === "region_transfer" && region === equipment.region ? " (current)" : ""}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {form.to_location_type === "patient" ? (
              <label className="space-y-1.5 text-sm font-medium">
                Patient
                <Select
                  value={form.patient_id}
                  disabled={isLoadingPatients || !form.to_region}
                  onChange={(event) => setForm((current) => {
                    const selected = patients.find((patient) => patient.id === event.target.value);
                    return {
                      ...current,
                      patient_id: event.target.value,
                      to_location_label: selected?.full_name ?? current.to_location_label,
                      to_region: selected?.region ?? current.to_region
                    };
                  })}
                >
                  <option value="">{isLoadingPatients ? "Loading patients..." : form.to_region ? "Choose patient" : "Choose destination region first"}</option>
                  {destinationPatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} / {patient.region}
                    </option>
                  ))}
                </Select>
                {patientsError ? <span className="block text-xs font-normal text-red-600 dark:text-red-300">{patientsError}</span> : null}
              </label>
            ) : null}
            {movementValidationMessage ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100">
                {movementValidationMessage}
              </div>
            ) : null}
            <label className="space-y-1.5 text-sm font-medium">
              Moved at
              <Input type="datetime-local" value={form.moved_at} onChange={(event) => setForm((current) => ({ ...current, moved_at: event.target.value }))} />
            </label>
            <Textarea className="min-h-24" value={form.notes} placeholder="Notes, handoff context, route detail..." onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <Button type="button" onClick={createMovement} disabled={isCreating || Boolean(movementValidationMessage)}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Record movement
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function initialMovementForm(equipment: Equipment, prefillQuery = ""): MovementFormState {
  const sourceType = currentLocationType(equipment);
  const params = new URLSearchParams(prefillQuery);
  const form: MovementFormState = {
    movement_type: "manual_adjustment",
    from_location_type: sourceType,
    from_location_label: `${equipment.region} ${humanize(sourceType)}`,
    from_region: equipment.region,
    to_location_type: equipment.status === "assigned" ? "patient" : equipment.status === "in_repair" ? "repair" : "warehouse",
    to_location_label: "",
    to_region: equipment.region,
    patient_id: "",
    moved_at: toDatetimeLocal(new Date()),
    notes: ""
  };
  const movementType = params.get("movement_type");
  const fromLocationType = params.get("from_location_type");
  const toLocationType = params.get("to_location_type");
  const fromRegion = params.get("from_region");
  const toRegion = params.get("to_region");
  const patientId = params.get("patient_id");
  if (isMovementType(movementType)) form.movement_type = movementType;
  if (isLocationType(fromLocationType)) form.from_location_type = fromLocationType;
  if (isLocationType(toLocationType)) form.to_location_type = toLocationType;
  if (isFloridaRegion(fromRegion) && fromRegion === equipment.region) form.from_region = fromRegion;
  if (isFloridaRegion(toRegion)) form.to_region = toRegion;
  form.from_location_label = params.get("from_location_label") ?? form.from_location_label;
  form.to_location_label = params.get("to_location_label") ?? form.to_location_label;
  form.patient_id = patientId ?? "";
  form.notes = params.get("notes") ?? form.notes;
  return form;
}

function currentLocationType(equipment: Equipment): EquipmentLocationType {
  if (equipment.status === "assigned") return "patient";
  if (equipment.status === "in_repair") return "repair";
  if (equipment.status === "return_in_progress") return "return_in_transit";
  if (equipment.status === "retired") return "retired";
  return "warehouse";
}

function getMovementValidationMessage(equipment: Equipment, form: MovementFormState) {
  if (form.from_region && form.from_region !== equipment.region) {
    return `This unit is currently in ${equipment.region}. The from region must stay ${equipment.region}.`;
  }

  if (form.movement_type === "region_transfer" && (!form.to_region || form.to_region === equipment.region)) {
    return `Choose a destination region different from ${equipment.region}.`;
  }

  if (form.to_location_type === "patient") {
    if (!form.to_region) return "Choose the destination region before moving this unit to a patient.";
    if (!form.patient_id) return "Choose the patient receiving this equipment.";
  }

  if (
    form.movement_type === "manual_adjustment" &&
    (!form.to_region || form.to_region === equipment.region) &&
    form.from_location_type === form.to_location_type
  ) {
    return `This unit is already in ${equipment.region} as ${humanize(currentLocationType(equipment))}. Choose a different destination.`;
  }

  return null;
}

function isMovementType(value: string | null): value is EquipmentMovementType {
  return Boolean(value && movementTypes.includes(value as EquipmentMovementType));
}

function isLocationType(value: string | null): value is EquipmentLocationType {
  return Boolean(value && locationTypes.includes(value as EquipmentLocationType));
}

function isFloridaRegion(value: string | null): value is FloridaRegion {
  return Boolean(value && floridaRegions.includes(value as FloridaRegion));
}

function LocationPill({ type, label, region }: { type: EquipmentLocationType; label: string | null; region: FloridaRegion | null }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/35 px-2.5 py-1 text-xs font-medium text-foreground">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{label || humanize(type)}</span>
      {region ? <span className="shrink-0 text-muted-foreground">({region})</span> : null}
    </span>
  );
}

function toDatetimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function MaintenanceHistory({ tasks }: { tasks: PreventiveMaintenanceTask[] }) {
  const [now] = useState(() => Date.now());
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preventive Maintenance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length ? tasks.map((task) => {
          const isOverdue = !["completed", "cancelled", "skipped"].includes(task.status) && new Date(task.due_at).getTime() < now;
          return (
            <div key={task.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={isOverdue ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" : undefined}>
                  {isOverdue ? "Overdue" : humanize(task.status)}
                </Badge>
                <Badge>{humanize(task.priority)}</Badge>
                <span className="text-xs text-muted-foreground">Due {new Date(task.due_at).toLocaleDateString()}</span>
              </div>
              <div className="mt-2 font-medium">{humanize(task.task_type)}</div>
              {task.notes ? <div className="mt-1 text-muted-foreground">{task.notes}</div> : null}
              {task.completion_notes ? <div className="mt-2 rounded-md bg-muted/40 p-2">{task.completion_notes}</div> : null}
            </div>
          );
        }) : <p className="text-sm text-muted-foreground">No preventive maintenance tasks loaded.</p>}
      </CardContent>
    </Card>
  );
}

function CostHistory({ events }: { events: EquipmentCostEvent[] }) {
  const total = events.reduce((sum, event) => sum + Number(event.amount), 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Cost Ledger</CardTitle>
          <Badge className="border-primary/25 bg-primary/10 text-primary">{currency(total)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length ? events.slice(0, 8).map((event) => (
          <div key={event.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{humanize(event.event_type)}</Badge>
                {event.vendor ? <span className="font-medium">{event.vendor}</span> : null}
              </div>
              <span className={event.amount < 0 ? "font-semibold text-emerald-700 dark:text-emerald-300" : "font-semibold"}>{currency(Number(event.amount))}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {new Date(event.occurred_at).toLocaleDateString()}
              {event.invoice_number ? ` / Invoice ${event.invoice_number}` : ""}
            </div>
            {event.notes ? <div className="mt-2 text-muted-foreground">{event.notes}</div> : null}
          </div>
        )) : <p className="text-sm text-muted-foreground">No cost events loaded.</p>}
      </CardContent>
    </Card>
  );
}

export function PatientDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<PatientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const { toast } = useToast();
  const refreshDetail = useCallback(() => {
    apiGet<PatientDetailData>(`/patients/${id}/detail`).then((data) => {
      setDetail(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load patient detail.");
    });
  }, [id]);
  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  async function savePatientProfile(values: PatientProfileFormValues) {
    if (!detail) return;
    try {
      const updated = await apiSend<Patient>(`/patients/${detail.patient.id}`, "PATCH", values);
      setDetail((current) => current ? { ...current, patient: updated } : current);
      refreshDetail();
      toast({ kind: "success", title: "Patient updated", description: updated.full_name });
    } catch (reason) {
      toast({ kind: "error", title: "Could not update patient", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  async function addPatientNote(body: string) {
    if (!detail) return;
    try {
      const note = await apiSend<PatientNote>(`/patients/${detail.patient.id}/notes`, "POST", { body });
      setDetail((current) => current ? { ...current, patient_notes: [note, ...(current.patient_notes ?? [])] } : current);
      refreshDetail();
      toast({ kind: "success", title: "Patient note added", description: detail.patient.full_name });
    } catch (reason) {
      toast({ kind: "error", title: "Could not add note", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  if (error) return <LoadError message={error} />;
  if (!detail) return <DetailSkeleton />;
  const address = patientAddress(detail.patient);

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{detail.patient.full_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Detail label="Date of Birth" value={new Date(detail.patient.date_of_birth).toLocaleDateString()} />
            <Detail label="Region" value={detail.patient.region} />
            <Detail label="Created" value={new Date(detail.patient.created_at).toLocaleString()} />
            <div className="md:col-span-2">
              <Detail label="Address" value={address || "No address recorded"} />
            </div>
            <Detail label="Last Updated" value={new Date(detail.patient.updated_at).toLocaleString()} />
          </CardContent>
        </Card>
        <PatientProfileEditor
          key={`${detail.patient.id}-${detail.patient.updated_at}`}
          patient={detail.patient}
          onSave={savePatientProfile}
        />
        <div className="xl:col-span-2">
          <PatientNotesPanel notes={detail.patient_notes ?? []} onAddNote={addPatientNote} />
        </div>
        <HistoryCard title="Assignment History" items={detail.assignments} empty="No assignment history loaded." />
        <HistoryCard title="Return History" items={detail.returns} empty="No return history loaded." />
        <HistoryCard title="Service Ticket History" items={detail.service_tickets} empty="No service tickets loaded." />
      </div>
      <Button
        type="button"
        className="fixed bottom-5 right-5 z-40 h-12 rounded-md border border-primary/25 bg-primary px-4 text-primary-foreground shadow-xl shadow-primary/20 hover:bg-primary/90 print:hidden"
        onClick={() => setIsTimelineOpen(true)}
      >
        <History className="h-4 w-4" />
        Timeline
        <span className="rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs">{detail.activity.length}</span>
      </Button>
      <PatientTimelineDrawer
        open={isTimelineOpen}
        patient={detail.patient}
        activity={detail.activity}
        onClose={() => setIsTimelineOpen(false)}
      />
    </>
  );
}

type PatientProfileFormValues = {
  full_name: string;
  date_of_birth: string;
  region: FloridaRegion;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string;
  postal_code: string | null;
};

function PatientProfileEditor({ patient, onSave }: { patient: Patient; onSave: (values: PatientProfileFormValues) => Promise<void> }) {
  const [values, setValues] = useState(() => patientToFormValues(patient));
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        ...values,
        address_line1: values.address_line1?.trim() || null,
        address_line2: values.address_line2?.trim() || null,
        city: values.city?.trim() || null,
        state: values.state.trim() || "FL",
        postal_code: values.postal_code?.trim() || null
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editable Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <Input value={values.full_name} onChange={(event) => setValues((current) => ({ ...current, full_name: event.target.value }))} placeholder="Full name" />
          <Input type="date" value={values.date_of_birth} onChange={(event) => setValues((current) => ({ ...current, date_of_birth: event.target.value }))} />
          <Select value={values.region} onChange={(event) => setValues((current) => ({ ...current, region: event.target.value as FloridaRegion }))}>
            {floridaRegions.map((region) => <option key={region}>{region}</option>)}
          </Select>
          <Input value={values.address_line1 ?? ""} onChange={(event) => setValues((current) => ({ ...current, address_line1: event.target.value }))} placeholder="Street address" />
          <Input value={values.address_line2 ?? ""} onChange={(event) => setValues((current) => ({ ...current, address_line2: event.target.value }))} placeholder="Apartment, suite, or unit" />
          <div className="grid gap-3 sm:grid-cols-[1fr_72px_112px]">
            <Input value={values.city ?? ""} onChange={(event) => setValues((current) => ({ ...current, city: event.target.value }))} placeholder="City" />
            <Input value={values.state} onChange={(event) => setValues((current) => ({ ...current, state: event.target.value }))} placeholder="State" />
            <Input value={values.postal_code ?? ""} onChange={(event) => setValues((current) => ({ ...current, postal_code: event.target.value }))} placeholder="ZIP" />
          </div>
          <Button type="submit" disabled={isSaving || values.full_name.trim().length < 2 || values.date_of_birth.length < 4}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Save Profile
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PatientNotesPanel({ notes, onAddNote }: { notes: PatientNote[]; onAddNote: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 2) return;
    setIsSaving(true);
    try {
      await onAddNote(trimmed);
      setBody("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Patient Notes</CardTitle>
          <Badge>{notes.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form className="space-y-3" onSubmit={submit}>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a patient note"
            className="min-h-32"
          />
          <Button type="submit" disabled={isSaving || body.trim().length < 2}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            Add Note
          </Button>
        </form>
        <div className="space-y-3">
          {notes.length ? notes.map((note) => <PatientNoteCard key={note.id} note={note} />) : (
            <EmptyState message="No patient notes recorded." />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PatientNoteCard({ note }: { note: PatientNote }) {
  const staffName = note.profiles?.full_name ?? "Unknown staff member";
  const staffRole = note.profiles?.role ? humanize(note.profiles.role) : null;

  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">{staffName}</div>
        <div className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</div>
      </div>
      {staffRole ? <div className="mt-0.5 text-xs text-muted-foreground">{staffRole}</div> : null}
      <div className="mt-3 whitespace-pre-wrap leading-relaxed">{note.body}</div>
    </div>
  );
}

function PatientTimelineDrawer({
  open,
  patient,
  activity,
  onClose
}: {
  open: boolean;
  patient: Patient;
  activity: ActivityLog[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby="patient-timeline-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-sm"
        aria-label="Close timeline"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-card shadow-2xl shadow-slate-950/30">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-primary">
              <History className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">Patient timeline</span>
            </div>
            <h2 id="patient-timeline-title" className="mt-2 truncate text-lg font-semibold">{patient.full_name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Address changes, profile edits, assignments, returns, service tickets, and audit events.</p>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground transition hover:bg-background hover:text-foreground"
            onClick={onClose}
            aria-label="Close timeline"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4 text-sm">
            {activity.length ? activity.map((item) => (
              <div key={item.id} className="relative border-l-2 border-primary/35 pb-1 pl-4">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{item.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-2 font-medium">{item.message}</div>
                <AuditChanges item={item} />
              </div>
            )) : (
              <div className="relative border-l-2 border-primary/35 pl-4">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                <div className="font-medium">Patient profile created</div>
                <div className="text-xs text-muted-foreground">{new Date(patient.created_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function patientToFormValues(patient: Patient): PatientProfileFormValues {
  return {
    full_name: patient.full_name,
    date_of_birth: patient.date_of_birth,
    region: patient.region,
    address_line1: patient.address_line1 ?? "",
    address_line2: patient.address_line2 ?? "",
    city: patient.city ?? "",
    state: patient.state ?? "FL",
    postal_code: patient.postal_code ?? ""
  };
}

function patientAddress(patient: Patient) {
  const stateAndZip = [patient.state, patient.postal_code].filter(Boolean).join(" ");
  const locality = [patient.city, stateAndZip].filter(Boolean).join(", ");
  return [
    patient.address_line1,
    patient.address_line2,
    locality
  ].filter(Boolean).join("\n");
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{value}</div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-5 w-36" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <ListSkeleton rows={3} />
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <ListSkeleton rows={4} />
        </CardContent>
      </Card>
    </div>
  );
}

function equipmentLabel(
  equipment: Pick<Equipment, "serial_number" | "make" | "model"> | null | undefined,
  fallbackId: string,
) {
  return equipment ? `${equipment.serial_number} - ${equipment.make} ${equipment.model}` : `Equipment ${fallbackId}`;
}

function isOverdueReturn(item: ReturnRecord) {
  const closedStatuses = new Set(["received", "inspected", "restocked", "closed", "cancelled"]);
  const requestedAt = new Date(item.requested_at).getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return !closedStatuses.has(item.status) && Date.now() - requestedAt > sevenDays;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function ActivityList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<ActivityLog[]>("/activity").then((items) => {
      setActivity(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load activity.");
    });
  }, [refreshKey]);
  return (
    <Card>
      <CardContent className="space-y-3">
        {error ? <LoadError message={error} /> : null}
        {activity.length ? activity.map((item) => (
          <div key={item.id} className="border-b border-border pb-3 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{item.event_type}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-2 text-sm font-medium">{item.message}</div>
            <AuditChanges item={item} />
            <div className="mt-1 text-xs text-muted-foreground">
              Equipment {item.equipment_id ?? "none"} / Patient {item.patient_id ?? "none"}
            </div>
          </div>
        )) : <EmptyState message="No activity loaded." />}
      </CardContent>
    </Card>
  );
}

function AuditChanges({ item }: { item: ActivityLog }) {
  const changes = item.metadata?.changes;
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const entries = Object.entries(changes as Record<string, { before?: unknown; after?: unknown }>).slice(0, 8);
  if (!entries.length) return null;
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/25 p-2 text-xs">
      <div className="mb-1 font-semibold text-muted-foreground">Changed fields</div>
      <div className="grid gap-1">
        {entries.map(([field, change]) => (
          <div key={field} className="grid gap-1 sm:grid-cols-[150px_1fr]">
            <span className="font-medium">{humanize(field)}</span>
            <span className="min-w-0">
              <span className="text-muted-foreground">{formatAuditValue(change.before)}</span>
              <span className="px-1.5 text-primary">to</span>
              <span>{formatAuditValue(change.after)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string" && value.startsWith("data:image/")) return "signature captured";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      Live data could not be loaded. {message}
    </div>
  );
}

function ActivityMessage({ item, assignments }: { item: ActivityLog; assignments: EquipmentDetailData["assignments"] }) {
  if (item.event_type === "patient_assigned" && item.patient_id) {
    const assignment = assignments.find((entry) => entry.patient_id === item.patient_id && entry.patients);
    if (assignment?.patients) {
      return (
        <>
          Assigned to{" "}
          <Link className="font-medium text-primary hover:underline" href={`/patients/${item.patient_id}`}>
            {assignment.patients.full_name}
          </Link>
          .
        </>
      );
    }
  }
  return <>{item.message}</>;
}

function HistoryCard({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length ? items.map((item) => (
          <div key={String(item.id)} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {"status" in item ? <Badge>{String(item.status)}</Badge> : null}
              {"priority" in item ? <Badge>{String(item.priority)}</Badge> : null}
            </div>
            <div className="mt-2 text-muted-foreground">
              {("equipment" in item && item.equipment && typeof item.equipment === "object") ? `${String((item.equipment as Record<string, unknown>).serial_number)} - ${String((item.equipment as Record<string, unknown>).make)} ${String((item.equipment as Record<string, unknown>).model)} ` : null}
              {("patients" in item && item.patients && typeof item.patients === "object") ? String((item.patients as Record<string, unknown>).full_name) : null}
              {("assigned_at" in item && item.assigned_at) ? `Assigned ${new Date(String(item.assigned_at)).toLocaleDateString()}` : null}
              {("requested_at" in item && item.requested_at) ? `Requested ${new Date(String(item.requested_at)).toLocaleDateString()}` : null}
              {("opened_at" in item && item.opened_at) ? `Opened ${new Date(String(item.opened_at)).toLocaleDateString()}` : null}
              {("issue_description" in item && item.issue_description) ? String(item.issue_description) : null}
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground">{empty}</p>}
      </CardContent>
    </Card>
  );
}
