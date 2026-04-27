"use client";

import Link from "next/link";
import { ClipboardCheck, Loader2, PackageCheck, QrCode, RefreshCw, Search, Warehouse } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AsyncSearchPicker, type SearchPickerOption } from "@/components/ui/async-search-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { cn, humanize, pluralize } from "@/lib/utils";
import {
  floridaRegions,
  type Equipment,
  type FloridaRegion,
  type WarehouseConditionGrade,
  type WarehouseProfile,
  type WarehouseReadinessStatus,
  type WarehouseSummary
} from "@/types/domain";

const conditionGrades: WarehouseConditionGrade[] = ["new", "ready", "good", "fair", "needs_repair", "hold", "retired"];
const readinessStatuses: WarehouseReadinessStatus[] = ["ready", "needs_cleaning", "needs_battery", "needs_repair", "hold", "retired"];

export function WarehouseClient() {
  const [profiles, setProfiles] = useState<WarehouseProfile[]>([]);
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState<FloridaRegion | "all">("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function refresh() {
    setIsLoading(true);
    const params = new URLSearchParams({ limit: "250" });
    if (regionFilter !== "all") params.set("region", regionFilter);
    if (query.trim()) params.set("search", query.trim());
    Promise.all([
      apiGet<WarehouseProfile[]>(`/warehouse/inventory?${params.toString()}`),
      apiGet<WarehouseSummary>("/warehouse/summary")
    ]).then(([items, nextSummary]) => {
      setProfiles(items);
      setSummary(nextSummary);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load warehouse.");
    }).finally(() => setIsLoading(false));
  }

  useEffect(() => {
    const handle = window.setTimeout(refresh, 120);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilter, query]);

  const metrics = useMemo(() => [
    { label: "Ready", value: summary?.ready ?? 0, tone: "good" },
    { label: "Needs attention", value: summary?.needs_attention ?? 0, tone: "warning" },
    { label: "On hold", value: summary?.hold ?? 0, tone: "neutral" },
    { label: "Counted last 30 days", value: summary?.counted_last_30_days ?? 0, tone: "primary" }
  ], [summary]);

  return (
    <div className="space-y-5">
      <PageHeader title="Warehouse" description="Receiving, bin/shelf locations, cycle counts, condition grading, and redeploy readiness." />
      {error ? <LoadError message={error} /> : null}
      {summary?.migration_required ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          Warehouse migration is not installed yet. Run `supabase/014_warehouse_mode.sql` in Supabase SQL Editor for full receiving, cycle count, and redeploy controls. This page is showing available inventory fallback data for now.
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2"><Warehouse className="h-4 w-4 text-primary" /> Warehouse Inventory</CardTitle>
              <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search serial, bin, shelf, condition" />
                </div>
                <Select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value as FloridaRegion | "all")}>
                  <option value="all">All regions</option>
                  {floridaRegions.map((region) => <option key={region}>{region}</option>)}
                </Select>
                <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={refresh}>
                  <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton rows={8} columns={6} /> : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead className="bg-muted/60">
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-4 py-3">Equipment</th>
                        <th className="px-4 py-3">Region</th>
                        <th className="px-4 py-3">Bin / Shelf</th>
                        <th className="px-4 py-3">Condition</th>
                        <th className="px-4 py-3">Readiness</th>
                        <th className="px-4 py-3">Last Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.map((profile) => (
                        <tr key={profile.equipment_id} className="border-b border-border last:border-0 hover:bg-muted/35">
                          <td className="px-4 py-3">
                            <Link className="font-medium text-primary hover:underline" href={`/equipment/${profile.equipment_id}`}>
                              {profile.equipment?.serial_number ?? profile.equipment_id}
                            </Link>
                            <div className="text-xs text-muted-foreground">{profile.equipment?.make} {profile.equipment?.model}</div>
                          </td>
                          <td className="px-4 py-3">{profile.region}</td>
                          <td className="px-4 py-3">{profile.bin_location || "No bin"} / {profile.shelf_location || "No shelf"}</td>
                          <td className="px-4 py-3"><Badge>{profile.condition_grade}</Badge></td>
                          <td className="px-4 py-3"><ReadinessBadge value={profile.readiness_status} /></td>
                          <td className="px-4 py-3">{profile.last_cycle_counted_at ? new Date(profile.last_cycle_counted_at).toLocaleDateString() : "Not counted"}</td>
                        </tr>
                      ))}
                      {!profiles.length ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No warehouse inventory matched.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <BulkReceivePanel onSaved={refresh} />
          <CycleCountPanel onSaved={refresh} />
          <RedeployChecklistPanel onSaved={refresh} />
        </div>
      </div>
    </div>
  );
}

function BulkReceivePanel({ onSaved }: { onSaved: () => void }) {
  const [serials, setSerials] = useState("");
  const [region, setRegion] = useState<FloridaRegion>("Tampa");
  const [binLocation, setBinLocation] = useState("");
  const [shelfLocation, setShelfLocation] = useState("");
  const [condition, setCondition] = useState<WarehouseConditionGrade>("good");
  const [readiness, setReadiness] = useState<WarehouseReadinessStatus>("ready");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  async function save() {
    setIsSaving(true);
    try {
      const serial_numbers = serials.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
      const result = await apiSend<{ received_count: number; missing_count: number }>("/warehouse/bulk-receive", "POST", {
        serial_numbers,
        region,
        bin_location: binLocation || null,
        shelf_location: shelfLocation || null,
        condition_grade: condition,
        readiness_status: readiness,
        notes: notes || null
      });
      toast({ kind: "success", title: "Receiving saved", description: `${pluralize(result.received_count, "unit")} received, ${pluralize(result.missing_count, "missing serial")}.` });
      setSerials("");
      onSaved();
    } catch (reason) {
      toast({ kind: "error", title: "Could not receive units", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><QrCode className="h-4 w-4 text-primary" /> Bulk Receive</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={serials} placeholder="Scan or paste serials, one per line" onChange={(event) => setSerials(event.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={region} onChange={(event) => setRegion(event.target.value as FloridaRegion)}>
            {floridaRegions.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Select value={condition} onChange={(event) => setCondition(event.target.value as WarehouseConditionGrade)}>
            {conditionGrades.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={binLocation} placeholder="Bin" onChange={(event) => setBinLocation(event.target.value)} />
          <Input value={shelfLocation} placeholder="Shelf" onChange={(event) => setShelfLocation(event.target.value)} />
        </div>
        <Select value={readiness} onChange={(event) => setReadiness(event.target.value as WarehouseReadinessStatus)}>
          {readinessStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
        </Select>
        <Textarea value={notes} placeholder="Receiving notes" onChange={(event) => setNotes(event.target.value)} />
        <Button type="button" onClick={save} disabled={isSaving || !serials.trim()}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Receive Units
        </Button>
      </CardContent>
    </Card>
  );
}

function CycleCountPanel({ onSaved }: { onSaved: () => void }) {
  const [serials, setSerials] = useState("");
  const [region, setRegion] = useState<FloridaRegion>("Tampa");
  const [binLocation, setBinLocation] = useState("");
  const [shelfLocation, setShelfLocation] = useState("");
  const [condition, setCondition] = useState<WarehouseConditionGrade>("good");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  async function save() {
    setIsSaving(true);
    try {
      const items = serials.split(/[\n,]+/).map((serial_number) => serial_number.trim()).filter(Boolean).map((serial_number) => ({
        serial_number,
        found: true,
        observed_status: "available",
        condition_grade: condition
      }));
      const result = await apiSend<{ counted_count: number; variances: unknown[] }>("/warehouse/cycle-counts", "POST", {
        region,
        bin_location: binLocation || null,
        shelf_location: shelfLocation || null,
        notes: notes || null,
        items
      });
      toast({ kind: "success", title: "Cycle count saved", description: `${pluralize(result.counted_count, "unit")} counted, ${pluralize(result.variances.length, "variance")}.` });
      setSerials("");
      onSaved();
    } catch (reason) {
      toast({ kind: "error", title: "Could not save count", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-primary" /> Cycle Count</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={serials} placeholder="Scan counted serials, one per line" onChange={(event) => setSerials(event.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={region} onChange={(event) => setRegion(event.target.value as FloridaRegion)}>
            {floridaRegions.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Select value={condition} onChange={(event) => setCondition(event.target.value as WarehouseConditionGrade)}>
            {conditionGrades.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={binLocation} placeholder="Bin counted" onChange={(event) => setBinLocation(event.target.value)} />
          <Input value={shelfLocation} placeholder="Shelf counted" onChange={(event) => setShelfLocation(event.target.value)} />
        </div>
        <Textarea value={notes} placeholder="Count notes" onChange={(event) => setNotes(event.target.value)} />
        <Button type="button" onClick={save} disabled={isSaving || !serials.trim()}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          Save Count
        </Button>
      </CardContent>
    </Card>
  );
}

function RedeployChecklistPanel({ onSaved }: { onSaved: () => void }) {
  const [equipment, setEquipment] = useState<SearchPickerOption | null>(null);
  const [values, setValues] = useState({
    cleaned: false,
    sanitized: false,
    battery_checked: false,
    charger_present: false,
    physical_inspection_passed: false,
    paperwork_ready: false,
    approved_for_redeploy: false,
    notes: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  function toggle(name: keyof typeof values) {
    if (name === "notes") return;
    setValues((current) => ({ ...current, [name]: !current[name] }));
  }

  async function save() {
    if (!equipment) return;
    setIsSaving(true);
    try {
      await apiSend("/warehouse/redeploy-checklists", "PUT", { equipment_id: equipment.id, ...values });
      toast({ kind: "success", title: "Redeploy checklist saved", description: values.approved_for_redeploy ? "Unit is ready for redeploy." : "Readiness updated." });
      onSaved();
    } catch (reason) {
      toast({ kind: "error", title: "Could not save checklist", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-primary" /> Redeploy Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <AsyncSearchPicker
          label="Equipment"
          placeholder="Search serial, make, model"
          value={equipment}
          loadOptions={loadEquipmentOptions}
          onChange={setEquipment}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["cleaned", "Cleaned"],
            ["sanitized", "Sanitized"],
            ["battery_checked", "Battery checked"],
            ["charger_present", "Charger present"],
            ["physical_inspection_passed", "Inspection passed"],
            ["paperwork_ready", "Paperwork ready"],
            ["approved_for_redeploy", "Approved"]
          ].map(([name, label]) => (
            <label key={name} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-primary/5">
              <Checkbox checked={Boolean(values[name as keyof typeof values])} onChange={() => toggle(name as keyof typeof values)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <Textarea value={values.notes} placeholder="Checklist notes" onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
        <Button type="button" onClick={save} disabled={isSaving || !equipment}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Save Checklist
        </Button>
      </CardContent>
    </Card>
  );
}

async function loadEquipmentOptions(query: string) {
  const params = new URLSearchParams({ limit: "12" });
  if (query.trim()) params.set("search", query.trim());
  const items = await apiGet<Equipment[]>(`/equipment?${params.toString()}`);
  return items.map((item) => ({
    id: item.id,
    label: `${item.serial_number} - ${item.make} ${item.model}`,
    description: `${humanize(item.equipment_type)} / ${humanize(item.status)} / ${item.region}`,
    region: item.region
  }));
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className={cn(tone === "warning" && "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/25", tone === "good" && "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/25")}>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function ReadinessBadge({ value }: { value: WarehouseReadinessStatus }) {
  if (value === "ready") {
    return <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">{value}</Badge>;
  }
  if (value === "hold" || value === "retired") {
    return <Badge className="border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{value}</Badge>;
  }
  return <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">{value}</Badge>;
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
