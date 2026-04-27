"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AlertTriangle, CheckCircle2, Clock3, Gauge, RotateCcw, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CardGridSkeleton, ListSkeleton, Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { humanize, pluralize } from "@/lib/utils";
import { equipmentTypes, floridaRegions, type DashboardSummary, type DashboardUtilization, type Equipment, type NotificationsResponse } from "@/types/domain";

const RegionBarChart = dynamic(() => import("@/features/dashboard/dashboard-charts").then((module) => module.RegionBarChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />
});
const TypePieChart = dynamic(() => import("@/features/dashboard/dashboard-charts").then((module) => module.TypePieChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />
});

const emptyDashboard: DashboardSummary = {
  total_equipment: 0,
  available: 0,
  assigned: 0,
  in_returns_process: 0,
  in_repair: 0,
  retired: 0,
  open_service_tickets: 0,
  active_returns: 0,
  overdue_returns: 0,
  completed_repairs: 0,
  tickets_opened_this_month: 0,
  equipment_by_region: [],
  equipment_by_type: [],
  zero_available: [],
  recent_activity: []
};

export function DashboardClient() {
  const [summary, setSummary] = useState<DashboardSummary>(emptyDashboard);
  const [utilization, setUtilization] = useState<DashboardUtilization | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [attention, setAttention] = useState<NotificationsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<DashboardSummary>("/dashboard/summary").then((data) => {
      setSummary(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load dashboard data.");
    }).finally(() => setIsLoading(false));
    apiGet<DashboardUtilization>("/dashboard/utilization").then(setUtilization).catch(() => undefined);
    apiGet<Equipment[]>("/equipment?limit=1000").then(setEquipment).catch(() => undefined);
    apiGet<NotificationsResponse>("/notifications").then(setAttention).catch(() => undefined);
  }, []);

  const cards = [
    ["Total equipment", summary.total_equipment],
    ["Available", summary.available],
    ["Assigned", summary.assigned],
    ["Returns", summary.in_returns_process],
    ["Overdue returns", summary.overdue_returns],
    ["In repair", summary.in_repair],
    ["Completed repairs", summary.completed_repairs],
    ["Open tickets", summary.open_service_tickets],
    ["Tickets this month", summary.tickets_opened_this_month],
    ["Retired", summary.retired]
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Operational health across Florida power wheelchair and scooter inventory." />
      {error ? <LoadError message={error} /> : null}
      {isLoading ? <CardGridSkeleton cards={8} /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={Number(value)} />)}
      </div>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <AttentionQueue attention={attention} isLoading={isLoading} />
        <Card>
          <CardHeader>
            <CardTitle>Regional Availability</CardTitle>
          </CardHeader>
          <CardContent>
            <AvailabilityMatrix equipment={equipment} />
          </CardContent>
        </Card>
      </div>
      <UtilizationPanel utilization={utilization} isLoading={isLoading} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Equipment By Region</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? <Skeleton className="h-full w-full" /> : <RegionBarChart summary={summary} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Equipment By Type</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {isLoading ? <Skeleton className="h-full w-full" /> : <TypePieChart summary={summary} />}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <ListSkeleton rows={4} /> : summary.recent_activity.length ? summary.recent_activity.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">{item.message}</div>
                <div className="text-xs text-muted-foreground">{humanize(item.event_type)}</div>
              </div>
              <time className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</time>
            </div>
          )) : <p className="text-sm text-muted-foreground">No activity loaded yet.</p>}
        </CardContent>
      </Card>
    </>
  );
}

function AttentionQueue({ attention, isLoading }: { attention: NotificationsResponse | null; isLoading: boolean }) {
  const items = attention?.items.slice(0, 5) ?? [];
  const critical = attention?.counts.critical ?? 0;
  const warning = attention?.counts.warning ?? 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Needs Attention</CardTitle>
          {critical || warning ? <Badge>{critical} critical / {warning} warning</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <ListSkeleton rows={4} /> : items.length ? items.map((item) => (
          <Link key={item.id} href={item.href} className="flex gap-3 rounded-md border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-primary/5 active:translate-y-px">
            <span className={item.severity === "critical" ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}>
              <AlertTriangle className="mt-0.5 h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.message}</span>
            </span>
          </Link>
        )) : (
          <div className="flex items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            Nothing needs attention right now.
          </div>
        )}
        <Link className="inline-flex text-sm font-semibold text-primary hover:underline" href="/notifications">Open all notifications</Link>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="h-2 w-2 rounded-full bg-primary/70" />
        </div>
        <div className="mt-3 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function UtilizationPanel({ utilization, isLoading }: { utilization: DashboardUtilization | null; isLoading: boolean }) {
  const regionRows = utilization?.by_region_type.slice().sort((a, b) => b.utilization_rate - a.utilization_rate).slice(0, 8) ?? [];
  return (
    <Card className="mt-5">
      <CardHeader>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Fleet Utilization</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Assigned use, idle stock, repair drag, and region/type utilization signals.</p>
          </div>
          {utilization ? <Badge>{pluralize(utilization.active_fleet, "active unit")}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !utilization ? <ListSkeleton rows={4} /> : (
          <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <UtilizationMetric label="Assigned utilization" value={`${utilization.utilization_rate}%`} icon={<Gauge className="h-4 w-4 text-primary" />} />
              <UtilizationMetric label="Repair drag" value={`${utilization.repair_drag_rate}%`} icon={<Wrench className="h-4 w-4 text-amber-600 dark:text-amber-300" />} />
              <UtilizationMetric label="Return drag" value={`${utilization.return_drag_rate}%`} icon={<RotateCcw className="h-4 w-4 text-sky-600 dark:text-sky-300" />} />
              <UtilizationMetric label="Idle 30+ days" value={String(utilization.idle_over_30_days)} icon={<Clock3 className="h-4 w-4 text-muted-foreground" />} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-border">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold">Longest Idle Available Units</div>
                <div className="divide-y divide-border">
                  {utilization.top_idle.length ? utilization.top_idle.map((item) => (
                    <Link key={item.id} href={`/equipment/${item.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition hover:bg-primary/5">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.serial_number} - {item.make} {item.model}</span>
                        <span className="block text-xs text-muted-foreground">{item.region} / {humanize(item.equipment_type)}</span>
                      </span>
                      <Badge className={item.idle_days >= 30 ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" : undefined}>
                        {pluralize(item.idle_days, "day")}
                      </Badge>
                    </Link>
                  )) : <div className="p-3 text-sm text-muted-foreground">No available units loaded.</div>}
                </div>
              </div>
              <div className="rounded-md border border-border">
                <div className="border-b border-border px-3 py-2 text-sm font-semibold">Top Region Utilization</div>
                <div className="divide-y divide-border">
                  {regionRows.length ? regionRows.map((item) => (
                    <div key={`${item.region}-${item.equipment_type}`} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{item.region} {humanize(item.equipment_type)}</span>
                        <span className="font-semibold text-primary">{item.utilization_rate}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                        <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, item.utilization_rate)}%` }} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.assigned} assigned / {item.total} total</div>
                    </div>
                  )) : <div className="p-3 text-sm text-muted-foreground">No utilization data loaded.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UtilizationMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function AvailabilityMatrix({ equipment }: { equipment: Equipment[] }) {
  const counts = new Map<string, { available: number; total: number }>();
  for (const item of equipment) {
    const key = `${item.region}:${item.equipment_type}`;
    const current = counts.get(key) ?? { available: 0, total: 0 };
    current.total += 1;
    if (item.status === "available") current.available += 1;
    counts.set(key, current);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/65">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Region</th>
            {equipmentTypes.map((type) => <th key={type} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{humanize(type)}</th>)}
          </tr>
        </thead>
        <tbody>
          {floridaRegions.map((region) => (
            <tr key={region} className="border-b border-border bg-card last:border-0 hover:bg-muted/45">
              <td className="px-4 py-3 font-medium">{region}</td>
              {equipmentTypes.map((type) => {
                const count = counts.get(`${region}:${type}`) ?? { available: 0, total: 0 };
                return (
                  <td key={type} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-7 rounded-md bg-primary/10 px-2 py-1 text-center text-sm font-semibold text-primary">{count.available}</span>
                      <span className="text-xs text-muted-foreground">available / {count.total} total</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      Live data could not be loaded. {message}
    </div>
  );
}
