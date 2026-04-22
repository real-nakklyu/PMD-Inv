"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { apiGet } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { currency, humanize } from "@/lib/utils";
import type { Equipment, EquipmentType } from "@/types/domain";

export function SpendReportClient() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Equipment[]>("/equipment?limit=1000").then((items) => {
      setEquipment(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load spend report.");
    });
  }, []);

  const rows = useMemo(() => buildSpendRows(equipment), [equipment]);
  const allTime = rows.filter((row) => row.period === "All time");
  const monthly = rows.filter((row) => row.period !== "All time");

  function exportReport() {
    downloadCsv(`pmdinv-spend-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
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
              <div className="mt-1 text-xs text-muted-foreground">{row.units} units / average {currency(row.average_spend)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
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
                  <td className="px-3 py-2">{row.units}</td>
                  <td className="px-3 py-2">{currency(row.total_spend)}</td>
                  <td className="px-3 py-2">{currency(row.average_spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
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
