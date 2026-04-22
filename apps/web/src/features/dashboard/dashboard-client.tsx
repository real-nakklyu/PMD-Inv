"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { apiGet } from "@/lib/api";
import { humanize } from "@/lib/utils";
import { equipmentTypes, floridaRegions, type DashboardSummary, type Equipment } from "@/types/domain";

const chartColors = ["#0f766e", "#2563eb", "#d97706", "#be123c", "#6d28d9", "#475569"];
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
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<DashboardSummary>("/dashboard/summary").then((data) => {
      setSummary(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load dashboard data.");
    });
    apiGet<Equipment[]>("/equipment?limit=1000").then(setEquipment).catch(() => undefined);
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => <StatCard key={label} label={String(label)} value={Number(value)} />)}
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Regional Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityMatrix equipment={equipment} />
        </CardContent>
      </Card>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Equipment By Region</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.equipment_by_region}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="region" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Equipment By Type</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary.equipment_by_type} dataKey="count" nameKey="type" outerRadius={98} label={(item) => humanize(String(item.type))}>
                  {summary.equipment_by_type.map((entry, index) => (
                    <Cell key={entry.type} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, humanize(String(name))]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.recent_activity.length ? summary.recent_activity.map((item) => (
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
