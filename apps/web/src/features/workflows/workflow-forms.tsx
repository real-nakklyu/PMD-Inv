"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, ClipboardPlus, Loader2, RotateCcw, Stethoscope, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { AttachmentUploader } from "@/components/storage/attachment-uploader";
import { AsyncSearchPicker, type SearchPickerOption } from "@/components/ui/async-search-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { humanize } from "@/lib/utils";
import {
  floridaRegions,
  returnStatuses,
  ticketStatuses,
  type Assignment,
  type Equipment,
  type Patient,
  type ReturnInspection,
  type ReturnRecord,
  type ServiceTicket
} from "@/types/domain";

const patientSchema = z.object({
  full_name: z.string().min(2),
  date_of_birth: z.string().min(4),
  region: z.enum(floridaRegions),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().min(2).max(40),
  postal_code: z.string().optional(),
  notes: z.string().optional()
});

export function PatientForm({ onSaved }: { onSaved?: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof patientSchema>>({
    resolver: zodResolver(patientSchema),
    defaultValues: { full_name: "", date_of_birth: "", region: "Tampa", address_line1: "", address_line2: "", city: "", state: "FL", postal_code: "", notes: "" }
  });

  async function onSubmit(values: z.infer<typeof patientSchema>) {
    setMessage(null);
    try {
      await apiSend("/patients", "POST", compactOptionalPatientFields(values));
      form.reset();
      setMessage("Patient created.");
      toast({ kind: "success", title: "Patient created", description: values.full_name });
      onSaved?.();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to create patient.";
      setMessage(description);
      toast({ kind: "error", title: "Could not create patient", description });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> New Patient</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <Input placeholder="Full name" {...form.register("full_name")} />
          <Input type="date" {...form.register("date_of_birth")} />
          <Select defaultValue="Tampa" {...form.register("region")}>
            {floridaRegions.map((region) => <option key={region}>{region}</option>)}
          </Select>
          <Input placeholder="Street address" {...form.register("address_line1")} />
          <Input placeholder="Apartment, suite, or unit" {...form.register("address_line2")} />
          <div className="grid gap-3 sm:grid-cols-[1fr_72px_112px]">
            <Input placeholder="City" {...form.register("city")} />
            <Input placeholder="State" {...form.register("state")} />
            <Input placeholder="ZIP" {...form.register("postal_code")} />
          </div>
          <Textarea placeholder="Patient notes" {...form.register("notes")} />
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          <Button type="submit">Create Patient</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function compactOptionalPatientFields(values: z.infer<typeof patientSchema>) {
  return {
    ...values,
    address_line1: values.address_line1?.trim() || null,
    address_line2: values.address_line2?.trim() || null,
    city: values.city?.trim() || null,
    state: values.state.trim() || "FL",
    postal_code: values.postal_code?.trim() || null,
    notes: values.notes?.trim() || null
  };
}

const assignmentSchema = z.object({
  equipment_id: z.string().min(1),
  patient_id: z.string().min(1),
  region: z.enum(floridaRegions),
  notes: z.string().optional()
});

export function AssignmentForm({ onSaved }: { onSaved?: () => void }) {
  const [selectedEquipment, setSelectedEquipment] = useState<SearchPickerOption | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<SearchPickerOption | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { equipment_id: "", patient_id: "", region: "Tampa", notes: "" }
  });
  const regionMismatch = selectedEquipment?.region && selectedPatient?.region && selectedEquipment.region !== selectedPatient.region
    ? { equipment: selectedEquipment.region, patient: selectedPatient.region }
    : null;

  async function onSubmit(values: z.infer<typeof assignmentSchema>) {
    setMessage(null);
    try {
      await apiSend("/assignments", "POST", values);
      form.reset();
      setSelectedEquipment(null);
      setSelectedPatient(null);
      setMessage("Assignment created.");
      toast({ kind: "success", title: "Equipment assigned", description: selectedEquipment?.label ?? "Assignment created." });
      onSaved?.();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to create assignment.";
      setMessage(description);
      toast({ kind: "error", title: "Could not create assignment", description });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardPlus className="h-4 w-4" /> Assign Equipment</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <AsyncSearchPicker
            label="Available equipment"
            placeholder="Search serial, make, model, or region"
            value={selectedEquipment}
            loadOptions={(query) => loadEquipmentOptions(query, "available")}
            onChange={(option) => {
              setSelectedEquipment(option);
              form.setValue("equipment_id", option?.id ?? "", { shouldValidate: true });
              if (option?.region && !selectedPatient?.region) form.setValue("region", option.region as (typeof floridaRegions)[number], { shouldValidate: true });
            }}
          />
          <AsyncSearchPicker
            label="Patient"
            placeholder="Search patient name or region"
            value={selectedPatient}
            loadOptions={loadPatientOptions}
            onChange={(option) => {
              setSelectedPatient(option);
              form.setValue("patient_id", option?.id ?? "", { shouldValidate: true });
              if (option?.region) form.setValue("region", option.region as (typeof floridaRegions)[number], { shouldValidate: true });
            }}
          />
          <Select defaultValue="Tampa" {...form.register("region")}>
            {floridaRegions.map((region) => <option key={region}>{region}</option>)}
          </Select>
          {regionMismatch ? (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This unit is in {regionMismatch.equipment}, but the patient is in {regionMismatch.patient}. Record a movement to {regionMismatch.patient} before assigning this item.
              </span>
            </div>
          ) : null}
          <Textarea placeholder="Assignment notes" {...form.register("notes")} />
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          <Button type="submit" disabled={Boolean(regionMismatch)}>Assign</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const returnSchema = z.object({
  equipment_id: z.string().min(1),
  patient_id: z.string().min(1),
  assignment_id: z.string().optional(),
  scheduled_at: z.string().optional(),
  pickup_address: z.string().optional(),
  notes: z.string().optional()
});

export function ReturnForm({ onSaved }: { onSaved?: () => void }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<SearchPickerOption | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<SearchPickerOption | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof returnSchema>>({
    resolver: zodResolver(returnSchema),
    defaultValues: { equipment_id: "", patient_id: "", assignment_id: "", scheduled_at: "", pickup_address: "", notes: "" }
  });

  useEffect(() => {
    apiGet<Assignment[]>("/assignments?status=active").then(setAssignments).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load active assignments.");
    });
  }, []);

  async function onSubmit(values: z.infer<typeof returnSchema>) {
    setMessage(null);
    const payload = { ...values, assignment_id: values.assignment_id || null, scheduled_at: values.scheduled_at ? new Date(values.scheduled_at).toISOString() : null };
    try {
      await apiSend("/returns", "POST", payload);
      form.reset();
      setSelectedEquipment(null);
      setSelectedPatient(null);
      setMessage("Return started.");
      toast({ kind: "success", title: "Return started", description: selectedEquipment?.label ?? "Return workflow created." });
      onSaved?.();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to start return.";
      setMessage(description);
      toast({ kind: "error", title: "Could not start return", description });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> Start Return</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <Select defaultValue="" {...form.register("assignment_id")} onChange={(event) => {
            const assignment = assignments.find((item) => item.id === event.target.value);
            form.setValue("assignment_id", event.target.value);
            if (assignment) {
              form.setValue("equipment_id", assignment.equipment_id);
              form.setValue("patient_id", assignment.patient_id);
              setSelectedEquipment(assignment.equipment ? equipmentToOption({ id: assignment.equipment_id, ...assignment.equipment }) : null);
              setSelectedPatient(assignment.patients ? patientToOption({ id: assignment.patient_id, ...assignment.patients }) : null);
            }
          }}>
            <option value="">Active assignment</option>
            {assignments.map((item) => <option key={item.id} value={item.id}>{item.region} - {new Date(item.assigned_at).toLocaleDateString()}</option>)}
          </Select>
          <AsyncSearchPicker
            label="Assigned equipment"
            placeholder="Search serial, make, model, or region"
            value={selectedEquipment}
            loadOptions={(query) => loadEquipmentOptions(query, "assigned")}
            onChange={(option) => {
              setSelectedEquipment(option);
              form.setValue("equipment_id", option?.id ?? "", { shouldValidate: true });
            }}
          />
          <AsyncSearchPicker
            label="Patient"
            placeholder="Search patient name or region"
            value={selectedPatient}
            loadOptions={loadPatientOptions}
            onChange={(option) => {
              setSelectedPatient(option);
              form.setValue("patient_id", option?.id ?? "", { shouldValidate: true });
            }}
          />
          <Input type="datetime-local" {...form.register("scheduled_at")} />
          <Input placeholder="Pickup address or route note" {...form.register("pickup_address")} />
          <Textarea placeholder="Return notes" {...form.register("notes")} />
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          <Button type="submit">Start Return</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ticketSchema = z.object({
  equipment_id: z.string().min(1),
  patient_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  issue_description: z.string().min(5)
});

export function ServiceTicketForm({ onSaved }: { onSaved?: () => void }) {
  const [selectedEquipment, setSelectedEquipment] = useState<SearchPickerOption | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<SearchPickerOption | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const form = useForm<z.infer<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { equipment_id: "", patient_id: "", priority: "medium", issue_description: "" }
  });

  async function onSubmit(values: z.infer<typeof ticketSchema>) {
    setMessage(null);
    try {
      await apiSend("/service-tickets", "POST", { ...values, patient_id: values.patient_id || null });
      form.reset();
      setSelectedEquipment(null);
      setSelectedPatient(null);
      setMessage("Service ticket opened.");
      toast({ kind: "success", title: "Service ticket opened", description: selectedEquipment?.label ?? "Ticket created." });
      onSaved?.();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to open service ticket.";
      setMessage(description);
      toast({ kind: "error", title: "Could not open ticket", description });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Stethoscope className="h-4 w-4" /> New Service Ticket</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <AsyncSearchPicker
            label="Equipment"
            placeholder="Search serial, make, model, or region"
            value={selectedEquipment}
            loadOptions={(query) => loadEquipmentOptions(query)}
            onChange={(option) => {
              setSelectedEquipment(option);
              form.setValue("equipment_id", option?.id ?? "", { shouldValidate: true });
            }}
          />
          <AsyncSearchPicker
            label="Patient link"
            placeholder="Optional: search patient name or region"
            value={selectedPatient}
            loadOptions={loadPatientOptions}
            onChange={(option) => {
              setSelectedPatient(option);
              form.setValue("patient_id", option?.id ?? "", { shouldValidate: true });
            }}
          />
          <Select defaultValue="medium" {...form.register("priority")}>
            {["low", "medium", "high", "urgent"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
          <Textarea placeholder="Issue description" {...form.register("issue_description")} />
          {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          <Button type="submit">Open Ticket</Button>
        </form>
      </CardContent>
    </Card>
  );
}

async function loadEquipmentOptions(query: string, status?: Equipment["status"]) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  if (status) params.set("status", status);
  const items = await apiGet<Equipment[]>(`/equipment?${params.toString()}`);
  return items.map(equipmentToOption);
}

async function loadPatientOptions(query: string) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<Patient[]>(`/patients?${params.toString()}`);
  return items.map(patientToOption);
}

function equipmentToOption(item: Pick<Equipment, "id" | "serial_number" | "make" | "model" | "equipment_type" | "status"> & Partial<Pick<Equipment, "region">>): SearchPickerOption {
  return {
    id: item.id,
    label: `${item.serial_number} - ${item.make} ${item.model}`,
    description: `${humanize(item.equipment_type)} / ${humanize(item.status)}${item.region ? ` / ${item.region}` : ""}`,
    region: item.region
  };
}

function patientToOption(item: Pick<Patient, "id" | "full_name" | "date_of_birth" | "region">): SearchPickerOption {
  return {
    id: item.id,
    label: item.full_name,
    description: `DOB ${new Date(item.date_of_birth).toLocaleDateString()} / ${item.region}`,
    region: item.region
  };
}

export function ReturnStatusControl({ record, onSaved }: { record: ReturnRecord; onSaved: () => void }) {
  const [status, setStatus] = useState(record.status);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  async function save() {
    setMessage(null);
    setIsSaving(true);
    try {
      await apiSend(`/returns/${record.id}/status`, "PATCH", { status, notes: note || null });
      setMessage("Updated.");
      toast({ kind: "success", title: "Return updated", description: `Status changed to ${humanize(status)}.` });
      onSaved();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to update return.";
      setMessage(description);
      toast({ kind: "error", title: "Could not update return", description });
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
        {returnStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
      </Select>
      <Input value={note} placeholder="Status note" onChange={(event) => setNote(event.target.value)} />
      <Button type="button" onClick={save} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {isSaving ? "Saving" : "Save"}
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}

export function ReturnInspectionChecklist({ record, onSaved }: { record: ReturnRecord; onSaved?: () => void }) {
  const [inspection, setInspection] = useState<ReturnInspection | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  const [values, setValues] = useState({
    cleaned: false,
    sanitized: false,
    battery_tested: false,
    charger_verified: false,
    damage_found: false,
    repair_ticket_created: false,
    approved_for_restock: false,
    notes: ""
  });

  useEffect(() => {
    apiGet<ReturnInspection | null>(`/returns/${record.id}/inspection`).then((item) => {
      if (!item) return;
      setInspection(item);
      setValues({
        cleaned: item.cleaned,
        sanitized: item.sanitized,
        battery_tested: item.battery_tested,
        charger_verified: item.charger_verified,
        damage_found: item.damage_found,
        repair_ticket_created: item.repair_ticket_created,
        approved_for_restock: item.approved_for_restock,
        notes: item.notes ?? ""
      });
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load inspection checklist.");
    });
  }, [record.id]);

  async function save() {
    setMessage(null);
    setIsSaving(true);
    try {
      const saved = await apiSend<ReturnInspection>(`/returns/${record.id}/inspection`, "PUT", values);
      setInspection(saved);
      setMessage("Inspection saved.");
      toast({ kind: "success", title: "Inspection saved", description: saved.approved_for_restock ? "Approved for restock." : "Checklist updated." });
      onSaved?.();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to save inspection.";
      setMessage(description);
      toast({ kind: "error", title: "Could not save inspection", description });
    } finally {
      setIsSaving(false);
    }
  }

  function toggle(name: keyof typeof values) {
    if (name === "notes") return;
    setValues((current) => ({ ...current, [name]: !current[name] }));
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Restock Inspection</div>
          <div className="text-xs text-muted-foreground">Required before moving a return to restocked.</div>
        </div>
        {inspection?.approved_for_restock ? <Badge>Approved</Badge> : <Badge>Pending</Badge>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          ["cleaned", "Cleaned"],
          ["sanitized", "Sanitized"],
          ["battery_tested", "Battery tested"],
          ["charger_verified", "Charger verified"],
          ["damage_found", "Damage found"],
          ["repair_ticket_created", "Repair ticket created"],
          ["approved_for_restock", "Approved for restock"]
        ].map(([name, label]) => (
          <label
            key={name}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium shadow-sm transition hover:border-primary/35 hover:bg-accent/50 active:translate-y-px"
          >
            <Checkbox checked={Boolean(values[name as keyof typeof values])} onChange={() => toggle(name as keyof typeof values)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <Textarea value={values.notes} placeholder="Inspection notes" onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isSaving ? "Saving" : "Save Inspection"}
        </Button>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}

export function TicketStatusControl({ ticket, onSaved }: { ticket: ServiceTicket; onSaved: () => void }) {
  const [status, setStatus] = useState(ticket.status);
  const [repairCompleted, setRepairCompleted] = useState(ticket.repair_completed);
  const [repairNotes, setRepairNotes] = useState(ticket.repair_notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();
  async function save() {
    setMessage(null);
    setIsSaving(true);
    try {
      await apiSend(`/service-tickets/${ticket.id}`, "PATCH", {
        status,
        repair_completed: repairCompleted,
        repair_notes: repairNotes || null
      });
      setMessage("Updated.");
      toast({ kind: "success", title: "Ticket updated", description: `Status is ${humanize(status)}.` });
      onSaved();
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unable to update ticket.";
      setMessage(description);
      toast({ kind: "error", title: "Could not update ticket", description });
    } finally {
      setIsSaving(false);
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          {ticketStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
        </Select>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 text-sm font-medium shadow-sm transition hover:border-primary/35 hover:bg-accent/50 active:translate-y-px">
          <Checkbox checked={repairCompleted} onChange={(event) => setRepairCompleted(event.target.checked)} />
          <span>Repair completed</span>
        </label>
      </div>
      <Textarea value={repairNotes} placeholder="Repair notes" onChange={(event) => setRepairNotes(event.target.value)} />
      <AttachmentUploader scope="service-ticket" ownerId={ticket.id} label="Ticket photos / documents" />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isSaving ? "Saving" : "Save"}
        </Button>
        <Badge>{ticket.priority}</Badge>
        {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
      </div>
    </div>
  );
}
