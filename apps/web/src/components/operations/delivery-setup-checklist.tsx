"use client";

import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { SignaturePad } from "@/components/operations/signature-pad";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import type { DeliverySetupChecklist, OperationalAppointment } from "@/types/domain";

const checklistItems: Array<[keyof ChecklistValues, string]> = [
  ["delivered", "Equipment delivered"],
  ["setup_completed", "Setup completed"],
  ["patient_or_caregiver_instructed", "Patient/caregiver instructed"],
  ["safe_operation_reviewed", "Safe operation reviewed"],
  ["troubleshooting_reviewed", "Troubleshooting reviewed"],
  ["cleaning_reviewed", "Cleaning reviewed"],
  ["maintenance_reviewed", "Maintenance reviewed"],
  ["charger_confirmed", "Charger confirmed"],
  ["battery_charged", "Battery charged"],
  ["documents_left", "Documents left with patient"]
];

type ChecklistValues = Omit<
  DeliverySetupChecklist,
  "id" | "created_by" | "created_at" | "updated_at" | "signature_data_url" | "signature_name" | "signed_at" | "notes"
> & {
  signature_name: string;
  signature_data_url: string | null;
  notes: string;
};

export function DeliverySetupChecklistPanel({ appointment }: { appointment: OperationalAppointment }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [values, setValues] = useState<ChecklistValues>(() => defaults(appointment));
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    // Existing checklist data is synchronized from the API when the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    apiGet<DeliverySetupChecklist[]>(`/delivery-checklists?appointment_id=${appointment.id}`).then((items) => {
      if (!active || !items[0]) return;
      setValues(fromRecord(items[0], appointment));
    }).catch(() => undefined).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [appointment, isOpen]);

  if (!appointment.equipment_id || !appointment.patient_id) {
    return null;
  }

  const complete = checklistItems.every(([key]) => Boolean(values[key])) && Boolean(values.signature_name && values.signature_data_url);

  async function save() {
    setIsSaving(true);
    try {
      await apiSend("/delivery-checklists", "PUT", {
        ...values,
        signed_at: values.signature_data_url ? new Date().toISOString() : null,
        signature_name: values.signature_name || null,
        notes: values.notes || null
      });
      toast({ kind: "success", title: "Delivery checklist saved", description: complete ? "Setup documentation is complete." : "Checklist progress saved." });
    } catch (reason) {
      toast({ kind: "error", title: "Could not save checklist", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="mt-3 bg-muted/20 shadow-none">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Delivery / Setup Checklist
          </div>
          <div className="flex items-center gap-2">
            {complete ? <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Complete</Badge> : <Badge>In progress</Badge>}
            <Button type="button" className="h-8 bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setIsOpen((open) => !open)}>
              {isOpen ? "Hide" : "Open"}
            </Button>
          </div>
        </div>
        {isOpen ? (
          isLoading ? <div className="text-sm text-muted-foreground">Loading checklist...</div> : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {checklistItems.map(([key, label]) => (
                  <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-medium transition hover:border-primary/35 hover:bg-accent/50">
                    <Checkbox checked={Boolean(values[key])} onChange={() => setValues((current) => ({ ...current, [key]: !current[key] }))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <Input value={values.signature_name} placeholder="Signer full name" onChange={(event) => setValues((current) => ({ ...current, signature_name: event.target.value }))} />
              <SignaturePad value={values.signature_data_url} onChange={(signature) => setValues((current) => ({ ...current, signature_data_url: signature }))} />
              <Textarea value={values.notes} placeholder="Delivery/setup notes" onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
              <Button type="button" onClick={save} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isSaving ? "Saving" : "Save Checklist"}
              </Button>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function defaults(appointment: OperationalAppointment): ChecklistValues {
  return {
    appointment_id: appointment.id,
    assignment_id: null,
    equipment_id: appointment.equipment_id ?? "",
    patient_id: appointment.patient_id ?? "",
    region: appointment.region,
    delivered: false,
    setup_completed: false,
    patient_or_caregiver_instructed: false,
    safe_operation_reviewed: false,
    troubleshooting_reviewed: false,
    cleaning_reviewed: false,
    maintenance_reviewed: false,
    charger_confirmed: false,
    battery_charged: false,
    documents_left: false,
    signature_name: "",
    signature_data_url: null,
    notes: ""
  };
}

function fromRecord(record: DeliverySetupChecklist, appointment: OperationalAppointment): ChecklistValues {
  return {
    ...defaults(appointment),
    ...record,
    signature_name: record.signature_name ?? "",
    signature_data_url: record.signature_data_url,
    notes: record.notes ?? ""
  };
}
