"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ScanBarcode } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiSend } from "@/lib/api";
import { equipmentTypes, floridaRegions } from "@/types/domain";
import type { Equipment } from "@/types/domain";

const BarcodeScanner = dynamic(() => import("@/components/scanner/barcode-scanner").then((module) => module.BarcodeScanner), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />
});

const schema = z.object({
  equipment_type: z.enum(equipmentTypes),
  make: z.string().min(2),
  model: z.string().min(1),
  serial_number: z.string().min(3),
  bought_price: z.coerce.number().min(0),
  region: z.enum(floridaRegions),
  notes: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

type DuplicateEquipmentError = {
  code: "duplicate_equipment_serial";
  message: string;
  equipment: Pick<Equipment, "id" | "serial_number" | "make" | "model" | "equipment_type" | "status" | "region">;
  equipment_path: string;
  label: string;
};

export function EquipmentForm({ onCreated }: { onCreated: () => void }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateEquipmentError | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      equipment_type: "power_wheelchair",
      make: "",
      model: "",
      serial_number: "",
      bought_price: 0,
      region: "Tampa",
      notes: ""
    }
  });
  const serialNumber = useWatch({ control: form.control, name: "serial_number" });

  const handleScanResult = useCallback((serial: string) => {
    form.setValue("serial_number", serial, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  }, [form]);

  async function onSubmit(values: FormValues) {
    setMessage(null);
    setDuplicate(null);
    try {
      await apiSend("/equipment", "POST", { ...values, serial_number: values.serial_number.trim(), status: "available" });
      form.reset();
      onCreated();
      setMessage("Equipment created.");
    } catch (error) {
      const duplicateError = parseDuplicateEquipmentError(error);
      if (duplicateError) {
        setDuplicate(duplicateError);
        setMessage(duplicateError.message);
        return;
      }
      setMessage(error instanceof Error ? error.message : "Unable to create equipment.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Equipment</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Type</span>
            <Select defaultValue="power_wheelchair" {...form.register("equipment_type")}>
              <option value="power_wheelchair">Power wheelchair</option>
              <option value="scooter">Scooter</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Region</span>
            <Select defaultValue="Tampa" {...form.register("region")}>
              {floridaRegions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Make</span>
            <Input {...form.register("make")} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Model</span>
            <Input {...form.register("model")} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Serial Number</span>
            <div className="flex gap-2">
              <Input {...form.register("serial_number")} />
              <Button type="button" className="shrink-0" onClick={() => setScannerOpen((open) => !open)}>
                <ScanBarcode className="h-4 w-4" />
                Scan
              </Button>
            </div>
          </label>
          {scannerOpen ? (
            <div className="md:col-span-2">
              <BarcodeScanner value={serialNumber} onResult={handleScanResult} />
            </div>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">Bought Price</span>
            <Input type="number" step="0.01" {...form.register("bought_price")} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Notes</span>
            <Textarea {...form.register("notes")} />
          </label>
          {Object.values(form.formState.errors).length ? (
            <p className="text-sm text-rose-600 dark:text-rose-300 md:col-span-2">Check the required fields before saving.</p>
          ) : null}
          {duplicate ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 md:col-span-2 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">{duplicate.message}</div>
                  <Link className="mt-1 inline-flex font-medium text-primary hover:underline" href={duplicate.equipment_path}>
                    Open existing equipment: {duplicate.label}
                  </Link>
                  <div className="mt-1 text-xs opacity-80">
                    {duplicate.equipment.status} / {duplicate.equipment.region}
                  </div>
                </div>
              </div>
            </div>
          ) : message ? <p className="text-sm text-muted-foreground md:col-span-2">{message}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit">Create Equipment</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function parseDuplicateEquipmentError(error: unknown): DuplicateEquipmentError | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  try {
    const parsed = JSON.parse(error.body) as { detail?: unknown };
    const detail = parsed.detail;
    if (!detail || typeof detail !== "object" || !("code" in detail)) return null;
    const duplicate = detail as DuplicateEquipmentError;
    return duplicate.code === "duplicate_equipment_serial" ? duplicate : null;
  } catch {
    return null;
  }
}
