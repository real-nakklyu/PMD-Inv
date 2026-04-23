"use client";

import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { downloadEquipmentLabelPdf, getCurrentAssignedPatient } from "@/lib/label-pdf";
import { currency, humanize } from "@/lib/utils";
import type { EquipmentDetailData } from "@/types/domain";

export function EquipmentLabelDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<EquipmentDetailData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<EquipmentDetailData>(`/equipment/${id}/detail`).then((data) => {
      setDetail(data);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load equipment label.");
    });
  }, [id]);

  const equipment = detail?.equipment;
  const patient = getCurrentAssignedPatient(detail);
  const equipmentUrl = typeof window === "undefined" ? `/equipment/${id}` : `${window.location.origin}/equipment/${id}`;

  useEffect(() => {
    QRCode.toDataURL(equipmentUrl, { errorCorrectionLevel: "M", margin: 1, width: 360 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [equipmentUrl]);

  async function downloadPdf() {
    if (!equipment) return;
    setIsDownloading(true);
    try {
      await downloadEquipmentLabelPdf({ equipment, detail, origin: window.location.origin });
    } finally {
      setIsDownloading(false);
    }
  }

  if (error) {
    return <LoadError message={error} />;
  }

  if (!equipment) {
    return <LabelSkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <PageHeader title="Equipment QR Label" description="Download or print a complete field label packet with equipment and patient information." />
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={downloadPdf} disabled={isDownloading}>
            <Download className="h-4 w-4" />
            {isDownloading ? "Creating PDF" : "Download PDF"}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden print:border-slate-300 print:shadow-none">
        <div className="bg-primary px-5 py-5 text-primary-foreground">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold opacity-90">PMDInv Equipment Label</div>
              <h1 className="mt-1 text-3xl font-semibold">{equipment.serial_number}</h1>
              <p className="mt-1 text-sm opacity-90">{equipment.make} {equipment.model}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-white/15 px-3 py-1 text-sm font-semibold">{humanize(equipment.equipment_type)}</span>
              <span className="rounded-md bg-white/15 px-3 py-1 text-sm font-semibold">{humanize(equipment.status)}</span>
              <span className="rounded-md bg-white/15 px-3 py-1 text-sm font-semibold">{equipment.region}</span>
            </div>
          </div>
        </div>
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="flex aspect-square items-center justify-center rounded-lg border border-border bg-white p-4 shadow-sm">
              {/* QR data URLs are generated locally and do not benefit from Next image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${equipment.serial_number}`} className="h-full w-full" /> : <Skeleton className="h-full w-full" />}
            </div>
            <Link href={`/equipment/${equipment.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline print:hidden">
              Open equipment record <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-5">
            <InfoSection title="Equipment Information">
              <Info label="Serial" value={equipment.serial_number} />
              <Info label="Type" value={humanize(equipment.equipment_type)} />
              <Info label="Make" value={equipment.make} />
              <Info label="Model" value={equipment.model} />
              <Info label="Status" value={<Badge>{equipment.status}</Badge>} />
              <Info label="Region" value={equipment.region} />
              <Info label="Bought Price" value={currency(Number(equipment.bought_price))} />
              <Info label="Added" value={new Date(equipment.added_at).toLocaleString()} />
              <Info label="Assigned" value={equipment.assigned_at ? new Date(equipment.assigned_at).toLocaleString() : "Not assigned"} />
              <Info label="Repairs" value={`${detail?.repair_count ?? 0} completed`} />
            </InfoSection>
            <InfoSection title="Assigned Patient">
              {patient ? (
                <>
                  <Info label="Full Name" value={<Link className="font-semibold text-primary hover:underline print:text-black" href={`/patients/${patient.id}`}>{patient.full_name}</Link>} />
                  <Info label="Date of Birth" value={new Date(patient.date_of_birth).toLocaleDateString()} />
                  <Info label="Region" value={patient.region} />
                  <Info label="Assigned Date" value={new Date(patient.assigned_at).toLocaleString()} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No patient is currently assigned to this equipment.</p>
              )}
            </InfoSection>
            <InfoSection title="Operational Notes">
              <p className="text-sm text-muted-foreground">{equipment.notes?.trim() || "No equipment notes recorded."}</p>
              <p className="mt-3 break-all text-xs text-muted-foreground">{equipmentUrl}</p>
            </InfoSection>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-primary print:text-black">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function LabelSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-80" />
      <Card>
        <CardContent className="grid gap-6 p-5 lg:grid-cols-[260px_1fr]">
          <Skeleton className="aspect-square w-full" />
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {message}
    </div>
  );
}
