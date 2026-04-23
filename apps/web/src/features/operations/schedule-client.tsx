"use client";

import { CalendarClock, CheckCircle2, Clock, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
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
import { humanize } from "@/lib/utils";
import { floridaRegions, type Equipment, type OperationalAppointment, type Patient } from "@/types/domain";

const appointmentKinds = ["delivery", "pickup", "service", "return", "inspection"] as const;
const appointmentStatuses = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;
const driverNames = floridaRegions.map((region) => `Driver ${region}` as const);

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
    const params = new URLSearchParams({ limit: "150" });
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

  const grouped = useMemo(() => groupAppointments(appointments), [appointments]);

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
        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Appointment Board</div>
              <div className="text-xs text-muted-foreground">Grouped by scheduled day for field coordination.</div>
            </div>
            <Select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
              <option value="all">All regions</option>
              {floridaRegions.map((region) => <option key={region}>{region}</option>)}
            </Select>
          </div>
          {isLoading ? <ListSkeleton rows={5} /> : grouped.length ? grouped.map((group) => (
            <Card key={group.date}>
              <CardHeader>
                <CardTitle>{group.date}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.items.map((item) => <AppointmentCard key={item.id} item={item} onChanged={refresh} />)}
              </CardContent>
            </Card>
          )) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">No appointments found for this region.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AppointmentCard({ item, onChanged }: { item: OperationalAppointment; onChanged: () => void }) {
  const [status, setStatus] = useState(item.status);
  const [isSaving, setIsSaving] = useState(false);
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
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{item.kind}</Badge>
            <Badge>{item.status}</Badge>
            <span className="text-xs font-medium text-muted-foreground">{item.region}</span>
          </div>
          <div className="mt-2 text-base font-semibold">{item.title}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {new Date(item.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
            {item.location_note ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.location_note}</span> : null}
          </div>
          {item.driver_name ? <div className="mt-2 text-sm">Driver: <span className="font-medium">{item.driver_name}</span></div> : null}
          {item.patients ? <div className="mt-2 text-sm">Patient: <span className="font-medium">{item.patients.full_name}</span></div> : null}
          {item.equipment ? <div className="text-sm text-muted-foreground">Equipment: {item.equipment.serial_number} - {item.equipment.make} {item.equipment.model}</div> : null}
          {item.notes ? <div className="mt-2 text-sm text-muted-foreground">{item.notes}</div> : null}
          {item.kind === "delivery" ? <DeliverySetupChecklistPanel appointment={item} /> : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-[150px_auto_auto]">
          <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            {appointmentStatuses.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
          </Select>
          <Button type="button" onClick={saveStatus} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          </Button>
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
  const groups = new Map<string, OperationalAppointment[]>();
  for (const item of items) {
    const key = new Date(item.scheduled_start).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries()).map(([date, groupItems]) => ({ date, items: groupItems }));
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
