"use client";

import { CalendarClock, CheckCircle2, Clock, Columns3, FileDown, LayoutList, Loader2, MapPin, Plus, Trash2, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { AsyncSearchPicker, type SearchPickerOption } from "@/components/ui/async-search-picker";
import { DeliverySetupChecklistPanel } from "@/components/operations/delivery-setup-checklist";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { deliveryTicketNumber, downloadDeliveryTicketPdf } from "@/lib/delivery-ticket-pdf";
import { cn, humanize, pluralize } from "@/lib/utils";
import { floridaRegions, type AppointmentStatus, type Equipment, type OperationalAppointment, type Patient } from "@/types/domain";

const appointmentKinds = ["delivery", "pickup", "service", "return", "inspection"] as const;
const appointmentStatuses = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;
const driverNames = floridaRegions.map((region) => `Driver ${region}` as const);
const archivedAppointmentStatuses = new Set(["completed", "cancelled", "no_show"]);
const dateFilterOptions = ["all", "today", "next_7_days"] as const;
type BoardMode = "timeline" | "drivers";
type StatusFilter = "all" | AppointmentStatus;
type DriverFilter = "all" | "unassigned" | string;
type DateFilter = (typeof dateFilterOptions)[number];

const appointmentStatusStyles: Record<AppointmentStatus, { card: string; badge: string; accent: string; outcome: string }> = {
  scheduled: {
    card: "border-sky-300/70 bg-sky-50/70 dark:border-sky-700/70 dark:bg-sky-950/35",
    badge: "border-sky-300 bg-sky-100 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
    accent: "bg-sky-500 dark:bg-sky-400",
    outcome: "text-sky-950 dark:text-sky-100"
  },
  in_progress: {
    card: "border-amber-300/80 bg-amber-50/75 dark:border-amber-700/75 dark:bg-amber-950/35",
    badge: "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    accent: "bg-amber-500 dark:bg-amber-400",
    outcome: "text-amber-950 dark:text-amber-100"
  },
  completed: {
    card: "border-emerald-300/80 bg-emerald-50/75 dark:border-emerald-700/75 dark:bg-emerald-950/35",
    badge: "border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    accent: "bg-emerald-500 dark:bg-emerald-400",
    outcome: "text-emerald-950 dark:text-emerald-100"
  },
  cancelled: {
    card: "border-slate-300/80 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-900/65",
    badge: "border-slate-300 bg-slate-200 text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
    accent: "bg-slate-500 dark:bg-slate-400",
    outcome: "text-slate-950 dark:text-slate-100"
  },
  no_show: {
    card: "border-rose-300/80 bg-rose-50/75 dark:border-rose-700/75 dark:bg-rose-950/35",
    badge: "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100",
    accent: "bg-rose-500 dark:bg-rose-400",
    outcome: "text-rose-950 dark:text-rose-100"
  }
};

const schema = z.object({
  title: z.string().min(2),
  kind: z.enum(appointmentKinds),
  status: z.enum(appointmentStatuses),
  region: z.enum(floridaRegions),
  scheduled_start: z.string().min(1),
  scheduled_end: z.string().optional(),
  patient_id: z.string().optional(),
  equipment_id: z.string().optional(),
  driver_name: z.string().optional(),
  location_note: z.string().optional(),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export function ScheduleClient() {
  const [appointments, setAppointments] = useState<OperationalAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<SearchPickerOption | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<SearchPickerOption | null>(null);
  const [regionFilter, setRegionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [driverFilter, setDriverFilter] = useState<DriverFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [boardMode, setBoardMode] = useState<BoardMode>("drivers");
  const { toast } = useToast();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      kind: "delivery",
      status: "scheduled",
      region: "Tampa",
      scheduled_start: "",
      scheduled_end: "",
      patient_id: "",
      equipment_id: "",
      driver_name: "Driver Tampa",
      location_note: "",
      notes: ""
    }
  });

  function refresh() {
    setIsLoading(true);
    const params = new URLSearchParams({ limit: "300" });
    if (regionFilter !== "all") params.set("region", regionFilter);
    apiGet<OperationalAppointment[]>(`/appointments?${params.toString()}`).then((items) => {
      setAppointments(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load schedule.");
    }).finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Appointment rows are synchronized from the API whenever the region filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter]);

  async function onSubmit(values: FormValues) {
    setIsSaving(true);
    setError(null);
    try {
      await apiSend("/appointments", "POST", {
        ...values,
        scheduled_start: new Date(values.scheduled_start).toISOString(),
        scheduled_end: values.scheduled_end ? new Date(values.scheduled_end).toISOString() : null,
        patient_id: values.patient_id || null,
        equipment_id: values.equipment_id || null,
        driver_name: values.driver_name || null,
        location_note: values.location_note || null,
        notes: values.notes || null
      });
      form.reset();
      setSelectedPatient(null);
      setSelectedEquipment(null);
      toast({ kind: "success", title: "Appointment scheduled", description: values.title });
      refresh();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Unable to create appointment.";
      setError(description);
      toast({ kind: "error", title: "Could not schedule appointment", description });
    } finally {
      setIsSaving(false);
    }
  }

  const filteredAppointments = useMemo(() => {
    return appointments.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (driverFilter === "unassigned" && item.driver_name) return false;
      if (driverFilter !== "all" && driverFilter !== "unassigned" && item.driver_name !== driverFilter) return false;
      if (!matchesDateFilter(item, dateFilter)) return false;
      return true;
    });
  }, [appointments, dateFilter, driverFilter, statusFilter]);
  const grouped = useMemo(() => groupAppointments(filteredAppointments), [filteredAppointments]);
  const driverGroups = useMemo(() => groupAppointmentsByDriver(grouped.active.flatMap((group) => group.items)), [grouped.active]);
  const statusCounts = useMemo(() => countByStatus(filteredAppointments), [filteredAppointments]);
  const activeCount = grouped.active.reduce((sum, group) => sum + group.items.length, 0);
  const archivedCount = grouped.archived.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Schedule" description="Coordinate deliveries, pickups, service calls, return appointments, and inspections by Florida region." />
      {error ? <LoadError message={error} /> : null}
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Appointment</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
              <Input placeholder="Appointment title" {...form.register("title")} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Select defaultValue="delivery" {...form.register("kind")}>
                  {appointmentKinds.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
                <Select defaultValue="scheduled" {...form.register("status")}>
                  {appointmentStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
                </Select>
              </div>
              <Select defaultValue="Tampa" {...form.register("region")} onChange={(event) => {
                form.setValue("region", event.target.value as FormValues["region"]);
                form.setValue("driver_name", `Driver ${event.target.value}`);
              }}>
                {floridaRegions.map((region) => <option key={region}>{region}</option>)}
              </Select>
              <Select defaultValue="Driver Tampa" {...form.register("driver_name")}>
                <option value="">No driver assigned</option>
                {driverNames.map((driver) => <option key={driver} value={driver}>{driver}</option>)}
              </Select>
              <Input type="datetime-local" {...form.register("scheduled_start")} />
              <Input type="datetime-local" {...form.register("scheduled_end")} />
              <AsyncSearchPicker
                label="Patient"
                placeholder="Optional: search patient name or region"
                value={selectedPatient}
                loadOptions={loadPatientOptions}
                onChange={(option) => {
                  setSelectedPatient(option);
                  form.setValue("patient_id", option?.id ?? "");
                }}
              />
              <AsyncSearchPicker
                label="Equipment"
                placeholder="Optional: search serial, make, model, region"
                value={selectedEquipment}
                loadOptions={loadEquipmentOptions}
                onChange={(option) => {
                  setSelectedEquipment(option);
                  form.setValue("equipment_id", option?.id ?? "");
                }}
              />
              <Input placeholder="Address, route, or location note" {...form.register("location_note")} />
              <Textarea placeholder="Internal notes" {...form.register("notes")} />
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                {isSaving ? "Saving" : "Schedule"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          <DispatchBoardToolbar
            boardMode={boardMode}
            statusFilter={statusFilter}
            regionFilter={regionFilter}
            driverFilter={driverFilter}
            dateFilter={dateFilter}
            statusCounts={statusCounts}
            activeCount={activeCount}
            archivedCount={archivedCount}
            onBoardModeChange={setBoardMode}
            onStatusFilterChange={setStatusFilter}
            onRegionFilterChange={setRegionFilter}
            onDriverFilterChange={setDriverFilter}
            onDateFilterChange={setDateFilter}
          />
          {isLoading ? <ListSkeleton rows={5} /> : (
            <div className="space-y-5">
              {boardMode === "drivers" ? (
                <DriverDispatchBoard groups={driverGroups} onChanged={refresh} />
              ) : (
                <ScheduleSection
                  title="Active & Upcoming"
                  description="Scheduled and in-progress work that still needs attention."
                  groups={grouped.active}
                  emptyMessage="No active appointments found for these filters."
                  onChanged={refresh}
                />
              )}
              <ScheduleSection
                title="Completed & Archived"
                description="Finished, cancelled, and no-show appointments for reference."
                groups={grouped.archived}
                emptyMessage="No completed or archived appointments match these filters."
                onChanged={refresh}
                archived
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchBoardToolbar({
  boardMode,
  statusFilter,
  regionFilter,
  driverFilter,
  dateFilter,
  statusCounts,
  activeCount,
  archivedCount,
  onBoardModeChange,
  onStatusFilterChange,
  onRegionFilterChange,
  onDriverFilterChange,
  onDateFilterChange
}: {
  boardMode: BoardMode;
  statusFilter: StatusFilter;
  regionFilter: string;
  driverFilter: DriverFilter;
  dateFilter: DateFilter;
  statusCounts: Record<AppointmentStatus, number>;
  activeCount: number;
  archivedCount: number;
  onBoardModeChange: (mode: BoardMode) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
  onRegionFilterChange: (region: string) => void;
  onDriverFilterChange: (driver: DriverFilter) => void;
  onDateFilterChange: (filter: DateFilter) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-sm font-semibold">Dispatch Board</div>
          <div className="text-xs text-muted-foreground">Driver assignments, active work, and completed field history in one place.</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <SegmentButton active={boardMode === "drivers"} onClick={() => onBoardModeChange("drivers")}>
            <Columns3 className="h-4 w-4" />
            Drivers
          </SegmentButton>
          <SegmentButton active={boardMode === "timeline"} onClick={() => onBoardModeChange("timeline")}>
            <LayoutList className="h-4 w-4" />
            Timeline
          </SegmentButton>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Select value={regionFilter} onChange={(event) => onRegionFilterChange(event.target.value)}>
          <option value="all">All regions</option>
          {floridaRegions.map((region) => <option key={region}>{region}</option>)}
        </Select>
        <Select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          {appointmentStatuses.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
        </Select>
        <Select value={driverFilter} onChange={(event) => onDriverFilterChange(event.target.value)}>
          <option value="all">All drivers</option>
          <option value="unassigned">Unassigned</option>
          {driverNames.map((driver) => <option key={driver} value={driver}>{driver}</option>)}
        </Select>
        <Select value={dateFilter} onChange={(event) => onDateFilterChange(event.target.value as DateFilter)}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="next_7_days">Next 7 days</option>
        </Select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
        <MetricPill label="Active" value={activeCount} className="border-primary/25 bg-primary/10 text-primary dark:bg-primary/15" />
        <MetricPill label="History" value={archivedCount} className="border-border bg-muted/35 text-foreground" />
        {appointmentStatuses.map((status) => {
          const style = appointmentStatusStyles[status];
          return <MetricPill key={status} label={humanize(status)} value={statusCounts[status]} className={cn("border", style.badge)} />;
        })}
      </div>
    </div>
  );
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      className={cn(
        "h-9 bg-secondary px-3 text-secondary-foreground hover:bg-secondary/80",
        active && "border-primary/40 bg-primary/10 text-primary shadow-sm shadow-primary/10 hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20"
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}

function MetricPill({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cn("flex min-h-12 items-center justify-between rounded-md border px-3 py-2 text-sm", className)}>
      <span className="truncate font-medium">{label}</span>
      <span className="ml-2 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function DriverDispatchBoard({ groups, onChanged }: { groups: { driver: string; items: OperationalAppointment[] }[]; onChanged: () => void }) {
  if (!groups.length) {
    return (
      <Card>
        <CardContent className="grid min-h-52 place-items-center p-8 text-center">
          <div>
            <Truck className="mx-auto h-8 w-8 text-primary" />
            <div className="mt-3 text-sm font-semibold">No active dispatch work matches these filters.</div>
            <div className="mt-1 text-sm text-muted-foreground">Try another region, date, driver, or status.</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Driver Board</div>
          <div className="text-xs text-muted-foreground">Active appointments grouped by assigned driver.</div>
        </div>
        <div className="text-xs font-medium text-muted-foreground">{pluralize(groups.reduce((sum, group) => sum + group.items.length, 0), "active appointment")}</div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3 2xl:grid-cols-4">
        {groups.map((group) => (
          <Card key={group.driver} className="min-w-0 overflow-hidden">
            <CardHeader className="border-b border-border p-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Truck className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{group.driver}</span>
                </span>
                <Badge>{pluralize(group.items.length, "appointment")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[42rem] space-y-3 overflow-y-auto p-3">
              {group.items.map((item) => <AppointmentCard key={item.id} item={item} onChanged={onChanged} compact />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function AppointmentCard({ item, onChanged, compact = false }: { item: OperationalAppointment; onChanged: () => void; compact?: boolean }) {
  const [status, setStatus] = useState(item.status);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  async function saveStatus() {
    setIsSaving(true);
    try {
      await apiSend(`/appointments/${item.id}`, "PATCH", { status });
      toast({ kind: "success", title: "Appointment updated", description: humanize(status) });
      onChanged();
    } catch (reason) {
      toast({ kind: "error", title: "Could not update appointment", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }
  async function remove() {
    await apiSend(`/appointments/${item.id}`, "DELETE");
    toast({ kind: "success", title: "Appointment deleted" });
    setConfirmOpen(false);
    onChanged();
  }
  async function downloadTicket() {
    setIsDownloadingTicket(true);
    try {
      await downloadDeliveryTicketPdf(item);
      toast({ kind: "success", title: "Delivery ticket downloaded", description: deliveryTicketNumber(item) });
    } catch (reason) {
      toast({ kind: "error", title: "Could not create delivery ticket", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsDownloadingTicket(false);
    }
  }
  const archived = archivedAppointmentStatuses.has(item.status);
  const style = appointmentStatusStyles[item.status];
  const canDownloadDeliveryTicket = item.kind === "delivery";
  return (
    <div className={cn(
      "relative overflow-hidden rounded-lg border p-3 pl-4 shadow-sm transition",
      style.card,
      archived && "opacity-95"
    )}>
      <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", style.accent)} aria-hidden="true" />
      <div className={cn("flex flex-col gap-3", !compact && "md:flex-row md:items-start md:justify-between")}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{item.kind}</Badge>
            <Badge className={cn("border", style.badge)}>{humanize(item.status)}</Badge>
            <span className="text-xs font-medium text-muted-foreground">{item.region}</span>
            {archived ? <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">History</span> : null}
          </div>
          <div className="mt-2 text-base font-semibold">{item.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(item.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            {item.location_note ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.location_note}</span> : null}
          </div>
          {archived ? <div className={cn("mt-2 text-sm font-semibold", style.outcome)}>Outcome: {humanize(item.status)}</div> : null}
          {item.driver_name ? <div className="mt-2 text-sm">Driver: <span className="font-medium">{item.driver_name}</span></div> : null}
          {item.patients ? <div className="mt-2 text-sm">Patient: <span className="font-medium">{item.patients.full_name}</span></div> : null}
          {item.equipment ? <div className="text-sm text-muted-foreground">Equipment: {item.equipment.serial_number} - {item.equipment.make} {item.equipment.model}</div> : null}
          {item.notes ? <div className="mt-2 text-sm text-muted-foreground">{item.notes}</div> : null}
          {item.kind === "delivery" ? <DeliverySetupChecklistPanel appointment={item} /> : null}
        </div>
        <div className={cn(
          "grid gap-2",
          compact
            ? canDownloadDeliveryTicket ? "grid-cols-[1fr_auto_auto_auto]" : "grid-cols-[1fr_auto_auto]"
            : canDownloadDeliveryTicket ? "sm:grid-cols-[150px_auto_auto_auto]" : "sm:grid-cols-[150px_auto_auto]"
        )}>
          <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            {appointmentStatuses.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
          </Select>
          <Button type="button" onClick={saveStatus} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          </Button>
          {canDownloadDeliveryTicket ? (
            <Button
              type="button"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={downloadTicket}
              disabled={isDownloadingTicket}
              aria-label="Download delivery ticket PDF"
              title="Download delivery ticket PDF"
            >
              {isDownloadingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setConfirmOpen(true)} aria-label="Delete appointment">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete appointment?"
        description={`Are you sure you want to delete "${item.title}"? This removes it from the schedule.`}
        confirmLabel="Delete appointment"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}

function ScheduleSection({
  title,
  description,
  groups,
  emptyMessage,
  onChanged,
  archived = false
}: {
  title: string;
  description: string;
  groups: { date: string; items: OperationalAppointment[] }[];
  emptyMessage: string;
  onChanged: () => void;
  archived?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <div className="text-xs font-medium text-muted-foreground">{groups.reduce((sum, group) => sum + group.items.length, 0)} total</div>
      </div>
      {groups.length ? groups.map((group) => (
        <Card key={`${title}-${group.date}`} className={archived ? "border-border/70 bg-muted/10" : undefined}>
          <CardHeader>
            <CardTitle>{group.date}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((item) => <AppointmentCard key={item.id} item={item} onChanged={onChanged} />)}
          </CardContent>
        </Card>
      )) : (
        <Card className={archived ? "border-border/70 bg-muted/10" : undefined}>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</CardContent>
        </Card>
      )}
    </section>
  );
}

async function loadEquipmentOptions(query: string) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<Equipment[]>(`/equipment?${params.toString()}`);
  return items.map((item) => ({
    id: item.id,
    label: `${item.serial_number} - ${item.make} ${item.model}`,
    description: `${humanize(item.equipment_type)} / ${humanize(item.status)} / ${item.region}`
  }));
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

function groupAppointments(items: OperationalAppointment[]) {
  const active = new Map<string, OperationalAppointment[]>();
  const archived = new Map<string, OperationalAppointment[]>();
  for (const item of items) {
    const key = new Date(item.scheduled_start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const target = archivedAppointmentStatuses.has(item.status) ? archived : active;
    target.set(key, [...(target.get(key) ?? []), item]);
  }
  return {
    active: Array.from(active.entries()).map(([date, groupItems]) => ({ date, items: groupItems })),
    archived: Array.from(archived.entries()).map(([date, groupItems]) => ({ date, items: groupItems }))
  };
}

function groupAppointmentsByDriver(items: OperationalAppointment[]) {
  const groups = new Map<string, OperationalAppointment[]>();
  for (const item of items) {
    const key = item.driver_name || "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries())
    .map(([driver, groupItems]) => ({ driver, items: groupItems.sort(compareAppointments) }))
    .sort((left, right) => {
      if (left.driver === "Unassigned") return 1;
      if (right.driver === "Unassigned") return -1;
      return left.driver.localeCompare(right.driver);
    });
}

function countByStatus(items: OperationalAppointment[]) {
  return appointmentStatuses.reduce((counts, status) => {
    counts[status] = items.filter((item) => item.status === status).length;
    return counts;
  }, {} as Record<AppointmentStatus, number>);
}

function matchesDateFilter(item: OperationalAppointment, filter: DateFilter) {
  const start = new Date(item.scheduled_start);
  if (filter === "today") return isSameLocalDay(start, new Date());
  if (filter === "next_7_days") {
    const now = new Date();
    const end = new Date(now);
    end.setDate(now.getDate() + 7);
    end.setHours(23, 59, 59, 999);
    return start >= startOfDay(now) && start <= end;
  }
  return true;
}

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function compareAppointments(left: OperationalAppointment, right: OperationalAppointment) {
  return new Date(left.scheduled_start).getTime() - new Date(right.scheduled_start).getTime();
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
