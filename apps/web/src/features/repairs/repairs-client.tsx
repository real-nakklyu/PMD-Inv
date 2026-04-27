"use client";

import { CalendarClock, CheckCircle2, Download, Loader2, Plus, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { humanize } from "@/lib/utils";
import type { Equipment, MaintenanceTaskStatus, MaintenanceTaskType, PreventiveMaintenanceTask, ServiceTicket } from "@/types/domain";

const maintenanceTypes: MaintenanceTaskType[] = [
  "battery_check",
  "charger_check",
  "safety_inspection",
  "cleaning_sanitization",
  "tire_brake_check",
  "annual_pm",
  "other"
];

const maintenanceStatuses: MaintenanceTaskStatus[] = ["due", "scheduled", "completed", "skipped", "cancelled"];

export function RepairsClient() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [maintenance, setMaintenance] = useState<PreventiveMaintenanceTask[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const { toast } = useToast();

  function refreshRepairs() {
    apiGet<ServiceTicket[]>("/service-tickets").then((items) => {
      setTickets(items.filter((item) => item.repair_completed));
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load repair history.");
    });
  }

  function refreshMaintenance() {
    apiGet<PreventiveMaintenanceTask[]>("/maintenance").then((items) => {
      setMaintenance(items);
      setMaintenanceError(null);
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : "Unable to load preventive maintenance.";
      setMaintenanceError(message.includes("preventive_maintenance_tasks") ? "Run migration 011_preventive_maintenance.sql to enable preventive maintenance." : message);
    });
  }

  useEffect(() => {
    refreshRepairs();
    refreshMaintenance();
    apiGet<Equipment[]>("/equipment?limit=200").then(setEquipment).catch(() => setEquipment([]));
  }, []);

  const byEquipment = useMemo(() => {
    const counts = new Map<string, number>();
    tickets.forEach((ticket) => counts.set(ticket.equipment_id, (counts.get(ticket.equipment_id) ?? 0) + 1));
    return counts;
  }, [tickets]);
  const openMaintenance = maintenance.filter((item) => !["completed", "cancelled", "skipped"].includes(item.status));
  const overdueMaintenance = openMaintenance.filter((item) => new Date(item.due_at).getTime() < now);

  function exportRepairs() {
    downloadCsv(
      `pmdinv-repair-history-${new Date().toISOString().slice(0, 10)}.csv`,
      tickets.map((item) => ({
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        patient: item.patients?.full_name ?? item.patient_id ?? "",
        status: humanize(item.status),
        priority: humanize(item.priority),
        issue_description: item.issue_description,
        repair_notes: item.repair_notes ?? "",
        opened_at: item.opened_at,
        resolved_at: item.resolved_at ?? "",
        closed_at: item.closed_at ?? ""
      }))
    );
  }

  function exportMaintenance() {
    downloadCsv(
      `pmdinv-preventive-maintenance-${new Date().toISOString().slice(0, 10)}.csv`,
      maintenance.map((item) => ({
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        task_type: humanize(item.task_type),
        status: humanize(item.status),
        priority: humanize(item.priority),
        due_at: item.due_at,
        scheduled_at: item.scheduled_at ?? "",
        completed_at: item.completed_at ?? "",
        odometer_hours: item.odometer_hours ?? "",
        battery_voltage: item.battery_voltage ?? "",
        notes: item.notes ?? "",
        completion_notes: item.completion_notes ?? ""
      }))
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Repair History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Completed repair work across scooters and power wheelchairs.</p>
        </div>
        <Button type="button" onClick={exportRepairs}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Live repair history could not be loaded. {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Completed repairs" value={tickets.length} />
        <MetricCard label="Equipment repaired" value={byEquipment.size} />
        <MetricCard label="This month" value={tickets.filter((item) => isThisMonth(item.resolved_at ?? item.closed_at ?? item.opened_at)).length} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="PM due / scheduled" value={openMaintenance.length} icon={<CalendarClock className="h-4 w-4 text-primary" />} />
        <MetricCard label="Overdue PM" value={overdueMaintenance.length} tone={overdueMaintenance.length ? "warning" : "default"} icon={<ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-300" />} />
        <MetricCard label="PM completed" value={maintenance.filter((item) => item.status === "completed").length} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Preventive Maintenance</CardTitle>
            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={exportMaintenance}>
              <Download className="h-4 w-4" />
              Export PM CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[390px_1fr]">
          <MaintenanceCreateForm equipment={equipment} onCreated={() => {
            refreshMaintenance();
            toast({ kind: "success", title: "Maintenance task created" });
          }} />
          <div className="space-y-3">
            {maintenanceError ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                Preventive maintenance is not ready yet. {maintenanceError}
              </div>
            ) : null}
            {maintenance.length ? maintenance.map((task) => (
              <MaintenanceTaskRow key={task.id} task={task} now={now} onChanged={refreshMaintenance} />
            )) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No preventive maintenance tasks yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Repair Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tickets.length ? tickets.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-border pb-3 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="font-medium">{item.issue_description}</div>
                <div className="text-sm text-muted-foreground">{equipmentLabel(item.equipment, item.equipment_id)}</div>
                {item.repair_notes ? <div className="mt-2 text-sm">{item.repair_notes}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Badge>{humanize(item.priority)}</Badge>
                <Badge>{humanize(item.status)}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(item.resolved_at ?? item.closed_at ?? item.opened_at).toLocaleDateString()}</span>
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No completed repairs found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MaintenanceCreateForm({ equipment, onCreated }: { equipment: Equipment[]; onCreated: () => void }) {
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("battery_check");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState(toDatetimeLocal(addDays(new Date(), 7)));
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const matches = equipment
    .filter((item) => {
      const query = equipmentSearch.trim().toLowerCase();
      if (!query) return true;
      return `${item.serial_number} ${item.make} ${item.model} ${item.region}`.toLowerCase().includes(query);
    })
    .slice(0, 30);

  async function createTask() {
    if (!equipmentId) {
      toast({ kind: "error", title: "Choose equipment first" });
      return;
    }
    setIsSaving(true);
    try {
      await apiSend<PreventiveMaintenanceTask>("/maintenance", "POST", {
        equipment_id: equipmentId,
        task_type: taskType,
        priority,
        due_at: new Date(dueAt).toISOString(),
        notes: notes.trim() || null
      });
      setNotes("");
      onCreated();
    } catch (reason) {
      toast({ kind: "error", title: "Could not create maintenance", description: reason instanceof Error ? reason.message : "Unable to create task." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <div className="mb-4">
        <div className="font-semibold">Create PM Task</div>
        <p className="text-sm text-muted-foreground">Schedule battery, charger, cleaning, safety, and annual checks before equipment fails in the field.</p>
      </div>
      <div className="grid gap-3">
        <Input value={equipmentSearch} placeholder="Search serial, make, model, region..." onChange={(event) => setEquipmentSearch(event.target.value)} />
        <Select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
          <option value="">Select equipment</option>
          {matches.map((item) => <option key={item.id} value={item.id}>{item.serial_number} - {item.make} {item.model} ({item.region})</option>)}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={taskType} onChange={(event) => setTaskType(event.target.value as MaintenanceTaskType)}>
            {maintenanceTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
          </Select>
          <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
            {["low", "medium", "high", "urgent"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </Select>
        </div>
        <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        <Textarea className="min-h-24" value={notes} placeholder="What should the technician check?" onChange={(event) => setNotes(event.target.value)} />
        <Button type="button" onClick={createTask} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create task
        </Button>
      </div>
    </div>
  );
}

function MaintenanceTaskRow({ task, now, onChanged }: { task: PreventiveMaintenanceTask; now: number; onChanged: () => void }) {
  const [status, setStatus] = useState<MaintenanceTaskStatus>(task.status);
  const [completionNotes, setCompletionNotes] = useState(task.completion_notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const isOverdue = !["completed", "cancelled", "skipped"].includes(task.status) && new Date(task.due_at).getTime() < now;

  async function saveStatus() {
    setIsSaving(true);
    try {
      await apiSend<PreventiveMaintenanceTask>(`/maintenance/${task.id}`, "PATCH", {
        status,
        completion_notes: status === "completed" ? completionNotes : completionNotes || null
      });
      toast({ kind: "success", title: "Maintenance updated" });
      onChanged();
    } catch (reason) {
      toast({ kind: "error", title: "Could not update maintenance", description: reason instanceof Error ? reason.message : "Unable to update task." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_270px]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isOverdue ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" : undefined}>
              {isOverdue ? "Overdue" : humanize(task.status)}
            </Badge>
            <Badge>{humanize(task.priority)}</Badge>
            <span className="text-xs text-muted-foreground">Due {new Date(task.due_at).toLocaleString()}</span>
          </div>
          <div className="mt-2 font-medium">{humanize(task.task_type)}</div>
          <div className="text-sm text-muted-foreground">{equipmentLabel(task.equipment, task.equipment_id)}</div>
          {task.notes ? <p className="mt-2 text-sm">{task.notes}</p> : null}
          {task.completion_notes ? <p className="mt-2 rounded-md bg-muted/40 p-2 text-sm">{task.completion_notes}</p> : null}
        </div>
        <div className="grid gap-2">
          <Select value={status} onChange={(event) => setStatus(event.target.value as MaintenanceTaskStatus)}>
            {maintenanceStatuses.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </Select>
          {status === "completed" ? (
            <Textarea className="min-h-20" value={completionNotes} placeholder="Completion notes required" onChange={(event) => setCompletionNotes(event.target.value)} />
          ) : null}
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={saveStatus} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save status
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = "default", icon }: { label: string; value: number; tone?: "default" | "warning"; icon?: ReactNode }) {
  return (
    <Card className={tone === "warning" ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/40" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">{label}</div>
          {icon}
        </div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function equipmentLabel(
  equipment: Pick<Equipment, "serial_number" | "make" | "model"> | null | undefined,
  fallbackId: string,
) {
  return equipment ? `${equipment.serial_number} - ${equipment.make} ${equipment.model}` : `Equipment ${fallbackId}`;
}

function isThisMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDatetimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}
