"use client";

import Link from "next/link";
import { QrCode, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { humanize } from "@/lib/utils";
import { equipmentStatuses, equipmentTypes, floridaRegions, type Equipment } from "@/types/domain";

export function LabelBatchClient() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setIsLoading(true);
    const params = new URLSearchParams({ limit: "1000" });
    if (search.trim()) params.set("search", search.trim());
    if (region !== "all") params.set("region", region);
    if (type !== "all") params.set("equipment_type", type);
    if (status !== "all") params.set("status", status);
    apiGet<Equipment[]>(`/equipment?${params.toString()}`).then((items) => {
      setEquipment(items);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load label data.");
    }).finally(() => setIsLoading(false));
  }

  useEffect(() => {
    // Label records are loaded from the API on first visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byRegion = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of equipment) counts.set(item.region, (counts.get(item.region) ?? 0) + 1);
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [equipment]);

  return (
    <div className="space-y-5">
      <PageHeader title="QR Labels" description="Open individual label packets and download polished PDF labels with equipment and patient information." />
      {error ? <LoadError message={error} /> : null}
      <Card className="print:hidden">
        <CardContent className="grid gap-2 p-3 md:grid-cols-[1fr_160px_160px_160px_auto]">
          <Input value={search} placeholder="Search serial, make, model" onChange={(event) => setSearch(event.target.value)} />
          <Select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="all">All regions</option>
            {floridaRegions.map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All types</option>
            {equipmentTypes.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {equipmentStatuses.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            Load
          </Button>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Badge>{equipment.length} labels</Badge>
        {byRegion.map(([name, count]) => <Badge key={name} className="bg-secondary text-secondary-foreground">{name}: {count}</Badge>)}
      </div>
      {isLoading ? <ListSkeleton rows={6} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-2">
          {equipment.map((item) => <BatchQrLabel key={item.id} item={item} />)}
        </div>
      )}
    </div>
  );
}

function BatchQrLabel({ item }: { item: Equipment }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = typeof window === "undefined" ? `/equipment/${item.id}` : `${window.location.origin}/equipment/${item.id}`;
  useEffect(() => {
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 180 }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [url]);
  return (
    <Link href={`/labels/${item.id}`} className="break-inside-avoid rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:translate-y-px print:block print:border-slate-400 print:bg-white print:text-black print:shadow-none">
      <div className="grid grid-cols-[88px_1fr] gap-3">
        <div className="flex h-24 w-24 items-center justify-center rounded-md border border-border bg-white p-1.5">
          {/* QR data URLs are generated locally and do not benefit from Next image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {dataUrl ? <img src={dataUrl} alt={`QR for ${item.serial_number}`} className="h-full w-full" /> : <QrCode className="h-9 w-9 text-muted-foreground" />}
        </div>
        <div className="min-w-0 self-center">
          <div className="font-mono text-xs font-bold text-primary print:text-black">{item.serial_number}</div>
          <div className="mt-1 truncate text-sm font-semibold">{item.make} {item.model}</div>
          <div className="mt-1 text-xs text-muted-foreground print:text-slate-700">{humanize(item.equipment_type)} / {item.region}</div>
          <div className="mt-1 text-xs text-muted-foreground print:text-slate-700">{humanize(item.status)}</div>
          <div className="mt-2 text-xs font-semibold text-primary print:hidden">Open label packet</div>
        </div>
      </div>
    </Link>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
