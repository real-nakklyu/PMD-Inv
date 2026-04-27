"use client";

import { CalendarClock, CheckCircle2, ClipboardCheck, FileDown, Loader2, MapPin, QrCode, Search, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DeliverySetupChecklistPanel } from "@/components/operations/delivery-setup-checklist";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { deliveryTicketNumber, downloadDeliveryTicketPdf } from "@/lib/delivery-ticket-pdf";
import { cn, humanize, pluralize } from "@/lib/utils";
import { floridaRegions, type AppointmentStatus, type OperationalAppointment } from "@/types/domain";

const activeStatuses: AppointmentStatus[] = ["scheduled", "in_progress"];
const quickStatuses: AppointmentStatus[] = ["scheduled", "in_progress", "completed", "cancelled", "no_show"];
const driverNames = floridaRegions.map((region) => `Driver ${region}` as const);

type DateWindow = "today" | "next_7_days";

export function FieldModeClient() {
  const [appointments, setAppointments] = useState<OperationalAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateWindow, setDateWindow] = useState<DateWindow>("today");
  const [driverFilter, setDriverFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [scannedSerial, setScannedSerial] = useState("");
  const { toast } = useToast();

  function refresh() {
    setIsLoading(true);
    apiGet<OperationalAppointment[]>("/appointments?limit=300")
      .then((items) => {
        setAppointments(items);
        setError(null);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load field work."))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Field mode keeps a small active work cache and filters locally for fast mobile interaction.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const filteredAppointments = useMemo(() => {
    const search = query.trim().toLowerCase();
    return appointments
      .filter((item) => activeStatuses.includes(item.status))
      .filter((item) => matchesDateWindow(item, dateWindow))
      .filter((item) => driverFilter === "all" || item.driver_name === driverFilter || (driverFilter === "unassigned" && !item.driver_name))
      .filter((item) => {
        if (!search) return true;
        return [
          item.title,
          item.region,
          item.location_note,
          item.driver_name,
          item.patients?.full_name,
          item.equipment?.serial_number,
          item.equipment?.make,
          item.equipment?.model
        ].some((value) => value?.toLowerCase().includes(search));
      })
      .sort(compareAppointments);
  }, [appointments, dateWindow, driverFilter, query]);

  const matchedScan = useMemo(() => {
    const serial = scannedSerial.trim().toLowerCase();
    if (!serial) return null;
    return appointments.find((item) => item.equipment?.serial_number.toLowerCase() === serial) ?? null;
  }, [appointments, scannedSerial]);

  const nextJob = filteredAppointments[0] ?? null;

  return (
    <div className="space-y-5">
      <PageHeader title="Field Mode" description="Fast mobile workflow for drivers and technicians handling today’s deliveries, pickups, returns, and service calls." />
      {error ? <LoadError message={error} /> : null}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5 dark:bg-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                Next Stop
              </CardTitle>
            </CardHeader>
            <CardContent>
              {nextJob ? <CompactJobSummary appointment={nextJob} /> : <p className="text-sm text-muted-foreground">No active field work matches your filters.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                Scan Equipment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <BarcodeScanner value={scannedSerial} onResult={setScannedSerial} />
              {matchedScan ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                  Matched to {matchedScan.title} / {matchedScan.equipment?.serial_number}
                </div>
              ) : scannedSerial ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  No scheduled active job matched that serial.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_180px_180px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, serial, route, region" />
                </div>
                <Select value={dateWindow} onChange={(event) => setDateWindow(event.target.value as DateWindow)}>
                  <option value="today">Today</option>
                  <option value="next_7_days">Next 7 days</option>
                </Select>
                <Select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
                  <option value="all">All drivers</option>
                  <option value="unassigned">Unassigned</option>
                  {driverNames.map((driver) => <option key={driver} value={driver}>{driver}</option>)}
                </Select>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge>{pluralize(filteredAppointments.length, "active stop")}</Badge>
                <span>Use this view when updating work from a phone in the field.</span>
              </div>
            </CardContent>
          </Card>

          {isLoading ? <ListSkeleton rows={5} /> : (
            <div className="grid gap-3">
              {filteredAppointments.map((appointment) => (
                <FieldJobCard key={appointment.id} appointment={appointment} onChanged={refresh} />
              ))}
              {!filteredAppointments.length ? (
                <Card>
                  <CardContent className="grid min-h-52 place-items-center p-8 text-center">
                    <div>
                      <CalendarClock className="mx-auto h-8 w-8 text-primary" />
                      <div className="mt-3 text-sm font-semibold">No active field jobs found.</div>
                      <div className="mt-1 text-sm text-muted-foreground">Try another driver, date window, or search.</div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldJobCard({ appointment, onChanged }: { appointment: OperationalAppointment; onChanged: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingTicket, setIsDownloadingTicket] = useState(false);
  const { toast } = useToast();

  async function updateStatus(status: AppointmentStatus) {
    setIsSaving(true);
    try {
      await apiSend(`/appointments/${appointment.id}`, "PATCH", { status });
      toast({ kind: "success", title: "Status updated", description: humanize(status) });
      onChanged();
    } catch (reason) {
      toast({ kind: "error", title: "Could not update status", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadTicket() {
    setIsDownloadingTicket(true);
    try {
      await downloadDeliveryTicketPdf(appointment);
      toast({ kind: "success", title: "Delivery ticket downloaded", description: deliveryTicketNumber(appointment) });
    } catch (reason) {
      toast({ kind: "error", title: "Could not create delivery ticket", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsDownloadingTicket(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <CompactJobSummary appointment={appointment} />
        <div className="grid gap-2 sm:grid-cols-5">
          {quickStatuses.map((status) => (
            <Button
              key={status}
              type="button"
              className={cn(
                "h-9 bg-secondary px-2 text-xs text-secondary-foreground hover:bg-secondary/80",
                appointment.status === status && "border-primary/35 bg-primary/10 text-primary hover:bg-primary/15"
              )}
              disabled={isSaving}
              onClick={() => updateStatus(status)}
            >
              {isSaving && appointment.status !== status ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {humanize(status)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {appointment.kind === "delivery" ? (
            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={downloadTicket} disabled={isDownloadingTicket}>
              {isDownloadingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Delivery Ticket
            </Button>
          ) : null}
          {appointment.kind === "delivery" && appointment.equipment_id && appointment.patient_id ? (
            <Badge className="border-primary/25 bg-primary/10 text-primary">
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
              Setup checklist below
            </Badge>
          ) : null}
        </div>
        {appointment.kind === "delivery" ? <DeliverySetupChecklistPanel appointment={appointment} /> : null}
      </CardContent>
    </Card>
  );
}

function CompactJobSummary({ appointment }: { appointment: OperationalAppointment }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{appointment.kind}</Badge>
        <Badge>{appointment.status}</Badge>
        <span className="text-xs font-medium text-muted-foreground">{appointment.region}</span>
      </div>
      <div className="mt-2 text-base font-semibold">{appointment.title}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {new Date(appointment.scheduled_start).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
        {appointment.location_note ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {appointment.location_note}
          </span>
        ) : null}
      </div>
      {appointment.driver_name ? <div className="mt-2 text-sm">Driver: <span className="font-medium">{appointment.driver_name}</span></div> : null}
      {appointment.patients ? <div className="mt-1 text-sm">Patient: <span className="font-medium">{appointment.patients.full_name}</span></div> : null}
      {appointment.equipment ? <div className="mt-1 text-sm text-muted-foreground">Equipment: {appointment.equipment.serial_number} / {appointment.equipment.make} {appointment.equipment.model}</div> : null}
    </div>
  );
}

function matchesDateWindow(item: OperationalAppointment, window: DateWindow) {
  const scheduled = new Date(item.scheduled_start);
  const today = startOfDay(new Date());
  if (window === "today") return isSameLocalDay(scheduled, today);
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return scheduled >= today && scheduled <= end;
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
