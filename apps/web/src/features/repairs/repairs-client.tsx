"use client";

import { Download, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { humanize } from "@/lib/utils";
import type { Equipment, ServiceTicket } from "@/types/domain";

export function RepairsClient() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ServiceTicket[]>("/service-tickets").then((items) => {
      setTickets(items.filter((item) => item.repair_completed));
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load repair history.");
    });
  }, []);

  const byEquipment = useMemo(() => {
    const counts = new Map<string, number>();
    tickets.forEach((ticket) => counts.set(ticket.equipment_id, (counts.get(ticket.equipment_id) ?? 0) + 1));
    return counts;
  }, [tickets]);

  function exportRepairs() {
    downloadCsv(
      `pmdinv-repair-history-${new Date().toISOString().slice(0, 10)}.csv`,
      tickets.map((item) => ({
        equipment: equipmentLabel(item.equipment, item.equipment_id),
        patient: item.patients?.full_name ?? item.patient_id ?? "",
        status: humanize(item.status),
        priority: humanize(item.priority),
        issue_description: item.issue_description,
        repair_notes: item.repair_notes ?? "",
        opened_at: item.opened_at,
        resolved_at: item.resolved_at ?? "",
        closed_at: item.closed_at ?? ""
      }))
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Repair History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Completed repair work across scooters and power wheelchairs.</p>
        </div>
        <Button type="button" onClick={exportRepairs}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          Live repair history could not be loaded. {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Completed repairs" value={tickets.length} />
        <MetricCard label="Equipment repaired" value={byEquipment.size} />
        <MetricCard label="This month" value={tickets.filter((item) => isThisMonth(item.resolved_at ?? item.closed_at ?? item.opened_at)).length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Repair Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tickets.length ? tickets.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-border pb-3 last:border-0 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="font-medium">{item.issue_description}</div>
                <div className="text-sm text-muted-foreground">{equipmentLabel(item.equipment, item.equipment_id)}</div>
                {item.repair_notes ? <div className="mt-2 text-sm">{item.repair_notes}</div> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Badge>{humanize(item.priority)}</Badge>
                <Badge>{humanize(item.status)}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(item.resolved_at ?? item.closed_at ?? item.opened_at).toLocaleDateString()}</span>
              </div>
            </div>
          )) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No completed repairs found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function equipmentLabel(
  equipment: Pick<Equipment, "serial_number" | "make" | "model"> | null | undefined,
  fallbackId: string,
) {
  return equipment ? `${equipment.serial_number} - ${equipment.make} ${equipment.model}` : `Equipment ${fallbackId}`;
}

function isThisMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}
