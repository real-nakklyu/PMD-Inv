"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, DatabaseZap, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { humanize } from "@/lib/utils";
import type { DataQualityIssue, DataQualityResponse } from "@/types/domain";

export function DataQualityClient() {
  const [data, setData] = useState<DataQualityResponse | null>(null);
  const [severity, setSeverity] = useState("all");
  const [kind, setKind] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiGet<DataQualityResponse>("/dashboard/data-quality").then((response) => {
      setData(response);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load data quality checks.");
    }).finally(() => setIsLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const issues = data?.issues ?? [];
    return issues.filter((issue) => {
      const severityMatches = severity === "all" || issue.severity === severity;
      const kindMatches = kind === "all" || issue.kind === kind;
      return severityMatches && kindMatches;
    });
  }, [data?.issues, kind, severity]);

  return (
    <div className="space-y-5">
      <PageHeader title="Data Quality" description="Find workflow mismatches before they become reporting, assignment, or inventory problems." />
      {error ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Total issues" value={data?.counts.total ?? 0} />
        <MetricCard label="Critical" value={data?.counts.critical ?? 0} tone="critical" />
        <MetricCard label="Warnings" value={data?.counts.warning ?? 0} tone="warning" />
        <MetricCard label="Info" value={data?.counts.info ?? 0} />
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><DatabaseZap className="h-4 w-4" /> Quality Checks</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Checks assigned status, active assignments, return state, repair completion, and missing purchase costs.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option value="all">All severity</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </Select>
              <Select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="all">All checks</option>
                <option value="missing_cost">Missing cost</option>
                <option value="assignment_mismatch">Assignment mismatch</option>
                <option value="return_mismatch">Return mismatch</option>
                <option value="repair_mismatch">Repair mismatch</option>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <ListSkeleton rows={6} /> : filtered.length ? (
            <div className="grid gap-3">
              {filtered.map((issue) => <QualityIssueRow key={issue.id} issue={issue} />)}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-8 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              No matching data quality issues found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QualityIssueRow({ issue }: { issue: DataQualityIssue }) {
  return (
    <Link href={issue.href} className="grid gap-3 rounded-md border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:translate-y-px md:grid-cols-[auto_1fr_auto] md:items-center">
      <span className={issue.severity === "critical" ? "grid h-10 w-10 place-items-center rounded-md bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200" : "grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200"}>
        <AlertTriangle className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <Badge className={issue.severity === "critical" ? "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"}>
            {humanize(issue.severity)}
          </Badge>
          <span className="text-xs font-semibold uppercase text-muted-foreground">{humanize(issue.kind)}</span>
          {issue.region ? <span className="text-xs text-muted-foreground">{issue.region}</span> : null}
        </span>
        <span className="mt-2 block font-semibold">{issue.title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{issue.detail}</span>
      </span>
      <span className="text-sm font-semibold text-primary">Review</span>
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
