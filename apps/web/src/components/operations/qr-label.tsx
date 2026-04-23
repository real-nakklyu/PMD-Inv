"use client";

import Link from "next/link";
import { QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Skeleton } from "@/components/ui/skeleton";

export function EquipmentQrLabel({
  equipmentId,
  serialNumber,
  make,
  model
}: {
  equipmentId: string;
  serialNumber: string;
  make: string;
  model: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const url = typeof window === "undefined" ? `/equipment/${equipmentId}` : `${window.location.origin}/equipment/${equipmentId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 220 }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [url]);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm print:border-slate-300 print:shadow-none">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <QrCode className="h-4 w-4" />
          Equipment QR Label
        </div>
        <Link
          href={`/labels/${equipmentId}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:translate-y-px active:scale-[0.98]"
        >
          <QrCode className="h-4 w-4" />
          Label Packet
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[132px_1fr] print:grid-cols-[132px_1fr]">
        <div className="flex h-32 w-32 items-center justify-center rounded-md border border-border bg-white p-2">
          {/* QR data URLs are generated locally and do not benefit from Next image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {dataUrl ? <img src={dataUrl} alt={`QR code for ${serialNumber}`} className="h-full w-full" /> : <Skeleton className="h-full w-full" />}
        </div>
        <div className="min-w-0 self-center">
          <div className="font-mono text-sm font-bold text-primary print:text-black">{serialNumber}</div>
          <div className="mt-1 text-lg font-semibold">{make} {model}</div>
          <div className="mt-2 break-all text-xs text-muted-foreground print:text-slate-700">{url}</div>
          <div className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground print:text-slate-700">Scan to open equipment record</div>
        </div>
      </div>
    </div>
  );
}
