"use client";

import Link from "next/link";
import { Download, ExternalLink, Printer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { AttachmentUploader } from "@/components/storage/attachment-uploader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { ticketDisplayNumber } from "@/lib/tickets";
import { humanize } from "@/lib/utils";
import type { ActivityLog, Assignment, Equipment, EquipmentDetailData, Patient, PatientDetailData, ReturnRecord, ServiceTicket } from "@/types/domain";
import { ReturnInspectionChecklist, ReturnStatusControl } from "@/features/workflows/workflow-forms";

export function AssignedList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<Assignment[]>("/assignments").then((items) => {
      setAssignments(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load assignments.");
    });
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
        {assignments.length ? assignments.map((item) => (
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
  const [error, setError] = useState<string | null>(null);
  function refresh() {
    apiGet<ReturnRecord[]>("/returns").then((items) => {
      setReturns(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load returns.");
    });
  }
  useEffect(() => {
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
  }
  async function deleteReturn(item: ReturnRecord) {
    if (!window.confirm(`Delete this return workflow?`)) return;
    try {
      await apiSend(`/returns/${item.id}`, "DELETE");
      refresh();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete return.");
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
        {returns.length ? returns.map((item) => (
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
                <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete return" onClick={() => deleteReturn(item)}>
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
          </div>
        )) : <EmptyState message="No return workflows loaded." />}
      </CardContent>
    </Card>
  );
}

export function TicketsList({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  function refresh() {
    apiGet<ServiceTicket[]>("/service-tickets").then((items) => {
      setTickets(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load service tickets.");
    });
  }
  useEffect(() => {
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
  }
  async function deleteTicket(ticket: ServiceTicket) {
    if (!window.confirm(`Delete service ticket ${ticketDisplayNumber(ticket)}?`)) return;
    try {
      await apiSend(`/service-tickets/${ticket.id}`, "DELETE");
      refresh();
      onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete service ticket.");
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
        {tickets.length ? tickets.map((item) => (
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
              <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete ticket" onClick={() => deleteTicket(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )) : <EmptyState message="No service tickets loaded." />}
      </CardContent>
    </Card>
  );
}

export function PatientsList({ refreshKey = 0 }: { refreshKey?: number }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [error, setError] = useState<string | null>(null);
  function refresh() {
    apiGet<Patient[]>("/patients").then((items) => {
      setPatients(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load patients.");
    });
  }
  useEffect(() => {
    refresh();
  }, [refreshKey]);
  async function deletePatient(item: Patient) {
    if (!window.confirm(`Delete patient ${item.full_name}? This only works when no workflow history depends on them.`)) return;
    try {
      await apiSend(`/patients/${item.id}`, "DELETE");
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete patient.");
    }
  }
  return (
    <Card>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {error ? <div className="md:col-span-2 xl:col-span-3"><LoadError message={error} /></div> : null}
        {patients.length ? patients.map((item) => (
          <div key={item.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <Link className="font-medium text-primary hover:underline" href={`/patients/${item.id}`}>{item.full_name}</Link>
              <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete patient" onClick={() => deletePatient(item)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">DOB {new Date(item.date_of_birth).toLocaleDateString()}</div>
            <div className="mt-3 flex justify-between text-sm">
              <span>{item.region}</span>
              <span className="text-muted-foreground">History ready</span>
            </div>
          </div>
        )) : <EmptyState message="No patients loaded." />}
      </CardContent>
    </Card>
  );
}

export function EquipmentDetail({ id }: { id: string }) {
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [detail, setDetail] = useState<EquipmentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
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
  if (!equipment) {
    return error ? <LoadError message={error} /> : <EmptyState message="Loading equipment detail..." />;
  }
  const currentAssignment = detail?.assignments.find((item) => item.status === "active" || item.status === "return_in_progress");
  return (
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
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(detail?.activity ?? []).length ? detail?.activity.map((item) => (
            <div key={item.id} className="border-l-2 border-primary pl-3">
              <div><ActivityMessage item={item} assignments={detail?.assignments ?? []} /></div>
              <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
            </div>
          )) : (
            <>
              <div className="border-l-2 border-primary pl-3">Equipment added to {equipment.region}</div>
              {equipment.assigned_at ? <div className="border-l-2 border-blue-500 pl-3">Assigned on {new Date(equipment.assigned_at).toLocaleDateString()}</div> : null}
            </>
          )}
        </CardContent>
      </Card>
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
    </div>
  );
}

export function PatientDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<PatientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<PatientDetailData>(`/patients/${id}/detail`).then((data) => {
      setDetail(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load patient detail.");
    });
  }, [id]);

  if (error) return <LoadError message={error} />;
  if (!detail) return <EmptyState message="Loading patient detail..." />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{detail.patient.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Detail label="Date of Birth" value={new Date(detail.patient.date_of_birth).toLocaleDateString()} />
          <Detail label="Region" value={detail.patient.region} />
          <Detail label="Created" value={new Date(detail.patient.created_at).toLocaleString()} />
        </CardContent>
      </Card>
      <HistoryCard title="Assignment History" items={detail.assignments} empty="No assignment history loaded." />
      <HistoryCard title="Return History" items={detail.returns} empty="No return history loaded." />
      <HistoryCard title="Service Ticket History" items={detail.service_tickets} empty="No service tickets loaded." />
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {detail.activity.length ? detail.activity.map((item) => (
            <div key={item.id} className="border-l-2 border-primary pl-3 text-sm">
              <div>{item.message}</div>
              <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
            </div>
          )) : <p className="text-sm text-muted-foreground">No activity loaded.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
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
            <div className="mt-1 text-xs text-muted-foreground">
              Equipment {item.equipment_id ?? "none"} / Patient {item.patient_id ?? "none"}
            </div>
          </div>
        )) : <EmptyState message="No activity loaded." />}
      </CardContent>
    </Card>
  );
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
