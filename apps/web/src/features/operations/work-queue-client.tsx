"use client";

import Link from "next/link";
import { AlertTriangle, Clock3, Filter, Wrench, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { humanize, pluralize } from "@/lib/utils";
import type { WorkQueueItem, WorkQueueResponse } from "@/types/domain";

const kindLabels: Record<WorkQueueItem["kind"], string> = {
  return: "Returns",
  service_ticket: "Service",
  repair_exception: "Repair exceptions",
  maintenance: "Maintenance"
};

export function WorkQueueClient() {
  const [queue, setQueue] = useState<WorkQueueResponse | null>(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiGet<WorkQueueResponse>("/notifications/work-queue").then((data) => {
      setQueue(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load work queue.");
    }).finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const items = queue?.items ?? [];
    return items.filter((item) => {
      const kindMatches = kindFilter === "all" || item.kind === kindFilter;
      const severityMatches = severityFilter === "all" || item.severity === severityFilter;
      return kindMatches && severityMatches;
    });
  }, [kindFilter, queue?.items, severityFilter]);

  return (
    <div className="space-y-5">
      <PageHeader title="Alerts" description="Aging returns, stale service tickets, repair exceptions, and preventive maintenance that needs action." />
      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total items" value={queue?.counts.total ?? 0} />
        <MetricCard label="Critical" value={queue?.counts.critical ?? 0} tone="critical" />
        <MetricCard label="Warning" value={queue?.counts.warning ?? 0} tone="warning" />
        <MetricCard label="Info" value={queue?.counts.info ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4" /> Aging Work Queue</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Sorted by severity and age so the oldest operational work stays visible.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value="all">All work types</option>
                {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                <option value="all">All severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <ListSkeleton rows={6} /> : filtered.length ? (
            <div className="grid gap-3">
              {filtered.map((item) => <WorkQueueRow key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-6 text-center text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100">
              No matching aging work items right now.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkQueueRow({ item }: { item: WorkQueueItem }) {
  const Icon = item.kind === "return" ? RotateCcw : item.kind === "service_ticket" ? Wrench : item.kind === "maintenance" ? ShieldCheck : AlertTriangle;
  return (
    <Link href={item.href} className="grid gap-3 rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:translate-y-px md:grid-cols-[auto_1fr_auto] md:items-center">
      <span className="grid h-10 w-10 place-items-center rounded-md bg-muted text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={severityClass(item.severity)}>{humanize(item.severity)}</Badge>
          <span className="text-xs font-semibold uppercase text-muted-foreground">{kindLabels[item.kind]}</span>
        </span>
        <span className="mt-2 block font-semibold">{item.title}</span>
        <span className="mt-1 block truncate text-sm text-muted-foreground">{item.entity_label}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{item.detail}</span>
      </span>
      <span className="flex items-center gap-2 md:flex-col md:items-end">
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{pluralize(item.age_days, "day")}</span>
      </span>
    </Link>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: "critical" | "warning" }) {
  return (
    <Card className={tone === "critical" ? "border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/35" : tone === "warning" ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/35" : undefined}>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
        </div>
        <Filter className="h-4 w-4 text-primary" />
      </CardContent>
    </Card>
  );
}

function severityClass(severity: WorkQueueItem["severity"]) {
  if (severity === "critical") return "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200";
  if (severity === "warning") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  return "border-primary/25 bg-primary/10 text-primary";
}
