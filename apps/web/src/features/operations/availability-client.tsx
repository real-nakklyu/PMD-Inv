"use client";

import { AlertTriangle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { humanize } from "@/lib/utils";
import { equipmentTypes, floridaRegions, type AvailabilitySummaryItem, type EquipmentType, type FloridaRegion } from "@/types/domain";

export function AvailabilityClient() {
  const [rows, setRows] = useState<AvailabilitySummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<AvailabilitySummaryItem | null>(null);
  const [minimum, setMinimum] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("all");
  const { toast } = useToast();

  function refresh() {
    setIsLoading(true);
    apiGet<AvailabilitySummaryItem[]>("/availability-thresholds/summary").then((items) => {
      setRows(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load availability thresholds.");
    }).finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Availability rows are loaded from the API when the page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const filtered = useMemo(() => rows.filter((row) => regionFilter === "all" || row.region === regionFilter), [regionFilter, rows]);
  const shortages = rows.filter((row) => row.shortage > 0);

  function edit(row: AvailabilitySummaryItem) {
    setSelected(row);
    setMinimum(row.minimum_available);
    setNotes(row.notes ?? "");
  }

  async function save() {
    if (!selected) return;
    setIsSaving(true);
    try {
      await apiSend("/availability-thresholds", "PUT", {
        region: selected.region,
        equipment_type: selected.equipment_type,
        minimum_available: minimum,
        notes: notes || null
      });
      toast({ kind: "success", title: "Threshold saved", description: `${selected.region} ${humanize(selected.equipment_type)}` });
      setSelected(null);
      refresh();
    } catch (reason) {
      toast({ kind: "error", title: "Could not save threshold", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Availability Rules" description="Set minimum on-hand targets by Florida region and equipment type." />
      {error ? <LoadError message={error} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Rules configured" value={rows.filter((row) => row.minimum_available > 0).length} />
        <SummaryCard label="Below target" value={shortages.length} tone={shortages.length ? "danger" : "good"} />
        <SummaryCard label="Available units tracked" value={rows.reduce((sum, row) => sum + row.available, 0)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Region Targets</CardTitle>
              <Select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                <option value="all">All regions</option>
                {floridaRegions.map((region) => <option key={region}>{region}</option>)}
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <TableSkeleton rows={8} columns={5} /> : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/65">
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-4 py-3">Region</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Available</th>
                        <th className="px-4 py-3">Minimum</th>
                        <th className="px-4 py-3">Health</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr key={`${row.region}-${row.equipment_type}`} className="border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{row.region}</td>
                          <td className="px-4 py-3">{humanize(row.equipment_type)}</td>
                          <td className="px-4 py-3">{row.available} / {row.total}</td>
                          <td className="px-4 py-3">{row.minimum_available}</td>
                          <td className="px-4 py-3">
                            {row.shortage ? <Badge className="border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">Short {row.shortage}</Badge> : <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">OK</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => edit(row)}>Edit</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Set Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Select value={selected?.region ?? "Tampa"} onChange={(event) => {
                const row = findOrCreateRow(rows, event.target.value as FloridaRegion, selected?.equipment_type ?? "power_wheelchair");
                edit(row);
              }}>
                {floridaRegions.map((region) => <option key={region}>{region}</option>)}
              </Select>
              <Select value={selected?.equipment_type ?? "power_wheelchair"} onChange={(event) => {
                const row = findOrCreateRow(rows, selected?.region ?? "Tampa", event.target.value as EquipmentType);
                edit(row);
              }}>
                {equipmentTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
              </Select>
            </div>
            <Input type="number" min={0} value={minimum} onChange={(event) => setMinimum(Number(event.target.value))} />
            <Textarea value={notes} placeholder="Rule notes" onChange={(event) => setNotes(event.target.value)} />
            <Button type="button" onClick={save} disabled={isSaving || !selected}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Threshold
            </Button>
            <p className="text-xs text-muted-foreground">Admins can tune these targets to avoid false alarms in regions where zero availability is normal.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function findOrCreateRow(rows: AvailabilitySummaryItem[], region: FloridaRegion, equipment_type: EquipmentType): AvailabilitySummaryItem {
  return rows.find((row) => row.region === region && row.equipment_type === equipment_type) ?? {
    region,
    equipment_type,
    available: 0,
    total: 0,
    minimum_available: 0,
    shortage: 0,
    threshold_id: null,
    notes: null
  };
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: "danger" | "good" }) {
  const Icon = tone === "danger" ? AlertTriangle : CheckCircle2;
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
        </div>
        <Icon className={tone === "danger" ? "h-5 w-5 text-red-600 dark:text-red-300" : "h-5 w-5 text-primary"} />
      </CardContent>
    </Card>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
