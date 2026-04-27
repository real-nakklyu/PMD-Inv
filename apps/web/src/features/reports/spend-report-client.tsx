"use client";

import { Download, Loader2, Plus, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { currency, humanize, pluralize } from "@/lib/utils";
import type { Equipment, EquipmentCostEvent, EquipmentCostEventType, EquipmentType } from "@/types/domain";

const costEventTypes: EquipmentCostEventType[] = ["purchase", "repair_parts", "repair_labor", "transport", "maintenance", "warranty_credit", "adjustment"];

export function SpendReportClient() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [costEvents, setCostEvents] = useState<EquipmentCostEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const { toast } = useToast();

  function refreshCosts() {
    apiGet<EquipmentCostEvent[]>("/cost-events?limit=1000").then((items) => {
      setCostEvents(items);
      setCostError(null);
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : "Unable to load cost ledger.";
      setCostError(message.includes("equipment_cost_events") ? "Run migration 012_equipment_cost_ledger.sql to enable the cost ledger." : message);
    });
  }

  useEffect(() => {
    apiGet<Equipment[]>("/equipment?limit=1000").then((items) => {
      setEquipment(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load spend report.");
    });
    refreshCosts();
  }, []);

  const rows = useMemo(() => buildSpendRows(equipment), [equipment]);
  const allTime = rows.filter((row) => row.period === "All time");
  const monthly = rows.filter((row) => row.period !== "All time");
  const costSummary = useMemo(() => buildCostSummary(costEvents), [costEvents]);
  const monthlyCostRows = useMemo(() => buildMonthlyCostRows(costEvents), [costEvents]);

  function exportReport() {
    downloadCsv(`pmdinv-spend-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportCostLedger() {
    downloadCsv(
      `pmdinv-cost-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      costEvents.map((item) => ({
        date: item.occurred_at,
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        type: humanize(item.event_type),
        amount: item.amount,
        vendor: item.vendor ?? "",
        invoice_number: item.invoice_number ?? "",
        notes: item.notes ?? ""
      }))
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader title="Reports" description="Purchasing spend by equipment type for scooters and power wheelchairs." />
        <Button type="button" onClick={exportReport}>
          <Download className="h-4 w-4" />
          Download Spend CSV
        </Button>
      </div>
      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {allTime.map((row) => (
          <Card key={row.type}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{humanize(row.type)}</div>
              <div className="mt-2 text-3xl font-semibold">{currency(row.total_spend)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{pluralize(row.units, "unit")} / average {currency(row.average_spend)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Ledger total" value={currency(costSummary.total)} />
        <SummaryCard label="Repair + maintenance" value={currency(costSummary.serviceSpend)} />
        <SummaryCard label="Warranty credits" value={currency(costSummary.warrantyCredits)} />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Equipment Cost Ledger</CardTitle>
            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={exportCostLedger}>
              <Download className="h-4 w-4" />
              Download Ledger CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-[390px_1fr]">
          <CostEventForm equipment={equipment} onCreated={() => {
            refreshCosts();
            toast({ kind: "success", title: "Cost event recorded" });
          }} />
          <div className="space-y-3">
            {costError ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                {costError}
              </div>
            ) : null}
            {costEvents.length ? costEvents.slice(0, 12).map((event) => (
              <div key={event.id} className="rounded-md border border-border bg-card p-3 text-sm shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{humanize(event.event_type)}</Badge>
                      {event.vendor ? <span className="font-medium">{event.vendor}</span> : null}
                      <span className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-2 text-muted-foreground">{equipmentLabel(event.equipment, event.equipment_id)}</div>
                    {event.invoice_number ? <div className="text-xs text-muted-foreground">Invoice {event.invoice_number}</div> : null}
                    {event.notes ? <p className="mt-2">{event.notes}</p> : null}
                  </div>
                  <div className={event.amount < 0 ? "text-lg font-semibold text-emerald-700 dark:text-emerald-300" : "text-lg font-semibold"}>
                    {currency(Number(event.amount))}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No cost events recorded yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Spend</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Units</th>
                <th className="px-3 py-2">Spend</th>
                <th className="px-3 py-2">Average</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((row) => (
                <tr key={`${row.period}-${row.type}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2">{humanize(row.type)}</td>
                  <td className="px-3 py-2">{pluralize(row.units, "unit")}</td>
                  <td className="px-3 py-2">{currency(row.total_spend)}</td>
                  <td className="px-3 py-2">{currency(row.average_spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Ledger Costs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Events</th>
                <th className="px-3 py-2">Net Cost</th>
              </tr>
            </thead>
            <tbody>
              {monthlyCostRows.map((row) => (
                <tr key={`${row.period}-${row.type}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.period}</td>
                  <td className="px-3 py-2">{humanize(row.type)}</td>
                  <td className="px-3 py-2">{pluralize(row.events, "event")}</td>
                  <td className="px-3 py-2">{currency(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CostEventForm({ equipment, onCreated }: { equipment: Equipment[]; onCreated: () => void }) {
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [eventType, setEventType] = useState<EquipmentCostEventType>("repair_parts");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const matches = equipment.filter((item) => {
    const query = equipmentSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.serial_number} ${item.make} ${item.model} ${item.region}`.toLowerCase().includes(query);
  }).slice(0, 30);

  async function createEvent() {
    if (!equipmentId || !amount || Number(amount) === 0) {
      toast({ kind: "error", title: "Equipment and non-zero amount are required" });
      return;
    }
    setIsSaving(true);
    try {
      await apiSend<EquipmentCostEvent>("/cost-events", "POST", {
        equipment_id: equipmentId,
        event_type: eventType,
        amount: Number(amount),
        vendor: vendor.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        occurred_at: new Date(occurredAt).toISOString(),
        notes: notes.trim() || null
      });
      setAmount("");
      setVendor("");
      setInvoiceNumber("");
      setNotes("");
      onCreated();
    } catch (reason) {
      toast({ kind: "error", title: "Could not record cost", description: reason instanceof Error ? reason.message : "Unable to record cost event." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/20 p-4">
      <div className="mb-4">
        <div className="font-semibold">Record Cost</div>
        <p className="text-sm text-muted-foreground">Track vendor invoices, repair parts, labor, transport, maintenance, and warranty credits.</p>
      </div>
      <div className="grid gap-3">
        <Input value={equipmentSearch} placeholder="Search serial, make, model, region..." onChange={(event) => setEquipmentSearch(event.target.value)} />
        <Select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
          <option value="">Select equipment</option>
          {matches.map((item) => <option key={item.id} value={item.id}>{item.serial_number} - {item.make} {item.model}</option>)}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={eventType} onChange={(event) => setEventType(event.target.value as EquipmentCostEventType)}>
            {costEventTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
          </Select>
          <Input type="number" step="0.01" value={amount} placeholder="Amount, negative for credit" onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={vendor} placeholder="Vendor" onChange={(event) => setVendor(event.target.value)} />
          <Input value={invoiceNumber} placeholder="Invoice number" onChange={(event) => setInvoiceNumber(event.target.value)} />
        </div>
        <Input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        <Textarea className="min-h-24" value={notes} placeholder="Cost notes..." onChange={(event) => setNotes(event.target.value)} />
        <Button type="button" onClick={createEvent} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Record cost
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function buildSpendRows(equipment: Equipment[]) {
  const groups = new Map<string, { period: string; type: EquipmentType; units: number; total_spend: number }>();
  for (const item of equipment) {
    const month = item.added_at.slice(0, 7);
    for (const period of ["All time", month]) {
      const key = `${period}:${item.equipment_type}`;
      const existing = groups.get(key) ?? { period, type: item.equipment_type, units: 0, total_spend: 0 };
      existing.units += 1;
      existing.total_spend += Number(item.bought_price ?? 0);
      groups.set(key, existing);
    }
  }
  return Array.from(groups.values())
    .map((row) => ({ ...row, average_spend: row.units ? row.total_spend / row.units : 0 }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.type.localeCompare(b.type));
}

function buildCostSummary(events: EquipmentCostEvent[]) {
  return events.reduce((summary, event) => {
    const amount = Number(event.amount);
    summary.total += amount;
    if (["repair_parts", "repair_labor", "maintenance"].includes(event.event_type)) summary.serviceSpend += amount;
    if (event.event_type === "warranty_credit") summary.warrantyCredits += amount;
    return summary;
  }, { total: 0, serviceSpend: 0, warrantyCredits: 0 });
}

function buildMonthlyCostRows(events: EquipmentCostEvent[]) {
  const groups = new Map<string, { period: string; type: EquipmentCostEventType; events: number; total: number }>();
  for (const event of events) {
    const period = event.occurred_at.slice(0, 7);
    const key = `${period}:${event.event_type}`;
    const existing = groups.get(key) ?? { period, type: event.event_type, events: 0, total: 0 };
    existing.events += 1;
    existing.total += Number(event.amount);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).sort((a, b) => b.period.localeCompare(a.period) || a.type.localeCompare(b.type));
}

function equipmentLabel(
  equipment: Pick<Equipment, "serial_number" | "make" | "model"> | null | undefined,
  fallbackId: string,
) {
  return equipment ? `${equipment.serial_number} - ${equipment.make} ${equipment.model}` : `Equipment ${fallbackId}`;
}

function toDatetimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}
