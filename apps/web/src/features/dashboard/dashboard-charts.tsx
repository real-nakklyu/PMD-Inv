"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { humanize } from "@/lib/utils";
import type { DashboardSummary } from "@/types/domain";

const chartColors = ["#0f766e", "#2563eb", "#d97706", "#be123c", "#6d28d9", "#475569"];

export function RegionBarChart({ summary }: { summary: DashboardSummary }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={summary.equipment_by_region}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="region" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TypePieChart({ summary }: { summary: DashboardSummary }) {
  return (
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
  );
}
