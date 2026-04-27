"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, PackagePlus, Route, Save, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { humanize, pluralize } from "@/lib/utils";
import { equipmentTypes, floridaRegions, type AvailabilityRecommendations, type AvailabilitySummaryItem, type AvailabilityTransferRecommendation, type EquipmentType, type FloridaRegion } from "@/types/domain";

export function AvailabilityClient() {
  const [rows, setRows] = useState<AvailabilitySummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<AvailabilitySummaryItem | null>(null);
  const [minimum, setMinimum] = useState(0);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<AvailabilityRecommendations | null>(null);
  const [regionFilter, setRegionFilter] = useState("all");
  const { toast } = useToast();

  function refresh() {
    setIsLoading(true);
    Promise.all([
      apiGet<AvailabilitySummaryItem[]>("/availability-thresholds/summary"),
      apiGet<AvailabilityRecommendations>("/availability-thresholds/recommendations")
    ]).then(([items, recs]) => {
      setRows(items);
      setRecommendations(recs);
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
        <SummaryCard label="Ready units tracked" value={rows.reduce((sum, row) => sum + (row.ready_available ?? row.available), 0)} />
      </div>
      <AvailabilityIntelligence recommendations={recommendations} isLoading={isLoading} />
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
                        <th className="px-4 py-3">Ready / Available</th>
                        <th className="px-4 py-3">Minimum</th>
                        <th className="px-4 py-3">Forecast</th>
                        <th className="px-4 py-3">Warehouse</th>
                        <th className="px-4 py-3">Health</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr key={`${row.region}-${row.equipment_type}`} className="border-b border-border last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3 font-medium">{row.region}</td>
                          <td className="px-4 py-3">{humanize(row.equipment_type)}</td>
                          <td className="px-4 py-3">{row.ready_available ?? row.available} / {row.available} <span className="text-xs text-muted-foreground">available</span></td>
                          <td className="px-4 py-3">{row.minimum_available}</td>
                          <td className="px-4 py-3">
                            <div>{row.forecasted_30_day_need ?? 0} need</div>
                            {(row.forecasted_shortage ?? 0) > 0 ? <div className="text-xs font-medium text-amber-700 dark:text-amber-300">{row.forecasted_shortage} forecast short</div> : null}
                          </td>
                          <td className="px-4 py-3">
                            <div>{row.idle_over_30_days ?? 0} idle 30d+</div>
                            {(row.warehouse_hold ?? 0) > 0 ? <div className="text-xs font-medium text-amber-700 dark:text-amber-300">{row.warehouse_hold} not ready</div> : null}
                          </td>
                          <td className="px-4 py-3">
                            {row.shortage ? <Badge className="border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">Short {pluralize(row.shortage, "unit")}</Badge> : <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">OK</Badge>}
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
    ready_available: 0,
    warehouse_hold: 0,
    idle_over_30_days: 0,
    forecasted_30_day_need: 0,
    forecasted_shortage: 0,
    threshold_id: null,
    notes: null
  };
}

function AvailabilityIntelligence({ recommendations, isLoading }: { recommendations: AvailabilityRecommendations | null; isLoading: boolean }) {
  const transfers = recommendations?.transfers ?? [];
  const procurement = recommendations?.procurement_needs ?? [];
  const isClear = recommendations && !transfers.length && !procurement.length;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Route className="h-4 w-4" /> Availability Intelligence</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Suggested transfers and procurement gaps based on your minimum on-hand rules.</p>
          </div>
          {recommendations ? (
            <div className="flex flex-wrap gap-2">
              <Badge className="border-primary/25 bg-primary/10 text-primary">{pluralize(recommendations.healthy_count, "healthy target")}</Badge>
              <Badge className={recommendations.shortage_count ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}>
                {pluralize(recommendations.shortage_count, "shortage")}
              </Badge>
              {recommendations.forecast_warning_count ? <Badge className="border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100">{pluralize(recommendations.forecast_warning_count, "forecast warning")}</Badge> : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <TableSkeleton rows={3} columns={3} /> : isClear ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100">
            No shortages need action right now. Configured targets are covered.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-primary" />
                Transfer Suggestions
              </div>
              {transfers.length ? transfers.map((item, index) => (
                <div key={`${item.from_region}-${item.to_region}-${item.equipment_type}-${index}`} className="rounded-md border border-border bg-card p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{pluralize(item.quantity, "unit")}</Badge>
                    <span className="font-medium">{humanize(item.equipment_type)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <RegionPill label={item.from_region} detail={`${pluralize(item.source_available, "available unit")} / min ${item.source_minimum}`} />
                    <ArrowRight className="h-4 w-4 text-primary" />
                    <RegionPill label={item.to_region} detail={`${pluralize(item.destination_available, "available unit")} / min ${item.destination_minimum}`} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.reason}</p>
                  {item.source_equipment.length ? (
                    <div className="mt-3 grid gap-2">
                      {item.source_equipment.map((equipment) => (
                        <Link
                          key={equipment.id}
                          className="group flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm transition hover:border-primary/45 hover:bg-primary/10 active:translate-y-px"
                          href={transferMovementHref(item, equipment)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{equipment.serial_number}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {equipment.make} {equipment.model}
                              {equipment.idle_days ? ` / idle ${equipment.idle_days}d` : ""}
                              {equipment.bin_location || equipment.shelf_location ? ` / ${equipment.bin_location ?? "No bin"} ${equipment.shelf_location ?? ""}` : ""}
                            </span>
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                            Move unit <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No internal transfer can cover current shortages.
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <PackagePlus className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                Procurement / External Need
              </div>
              {procurement.length ? procurement.map((item) => (
                <div key={`${item.region}-${item.equipment_type}`} className="rounded-md border border-amber-300 bg-amber-50/75 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100">Need {pluralize(item.quantity, "unit")}</Badge>
                    <span className="font-medium">{item.region} {humanize(item.equipment_type)}</span>
                  </div>
                  <p className="mt-2 text-sm opacity-85">{item.reason} Forecast need: {item.forecasted_30_day_need}.</p>
                </div>
              )) : (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Current shortages can be covered by suggested internal transfers.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function transferMovementHref(item: AvailabilityTransferRecommendation, equipment: AvailabilityTransferRecommendation["source_equipment"][number]) {
  const params = new URLSearchParams({
    movement_type: "region_transfer",
    from_location_type: "warehouse",
    from_region: item.from_region,
    to_location_type: "warehouse",
    to_location_label: `${item.to_region} warehouse`,
    to_region: item.to_region,
    notes: `Availability transfer suggestion: move ${equipment.serial_number} from ${item.from_region} to ${item.to_region}.`
  });
  return `/equipment/${equipment.id}?${params.toString()}`;
}

function RegionPill({ label, detail }: { label: string; detail: string }) {
  return (
    <span className="inline-flex flex-col rounded-md border border-border bg-muted/35 px-2.5 py-1">
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[11px] text-muted-foreground">{detail}</span>
    </span>
  );
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
