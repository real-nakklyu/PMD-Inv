"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ScanBarcode } from "lucide-react";
import { useCallback, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { apiSend } from "@/lib/api";
import { equipmentTypes, floridaRegions } from "@/types/domain";

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

export function EquipmentForm({ onCreated }: { onCreated: () => void }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    try {
      await apiSend("/equipment", "POST", { ...values, status: "available" });
      form.reset();
      onCreated();
      setMessage("Equipment created.");
    } catch (error) {
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
            <Select {...form.register("equipment_type")}>
              <option value="power_wheelchair">Power wheelchair</option>
              <option value="scooter">Scooter</option>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Region</span>
            <Select {...form.register("region")}>
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
          {message ? <p className="text-sm text-muted-foreground md:col-span-2">{message}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit">Create Equipment</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
