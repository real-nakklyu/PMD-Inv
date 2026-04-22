"use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { EquipmentForm } from "@/features/equipment/equipment-form";
import { InventoryTable } from "@/features/equipment/inventory-table";

export default function InventoryPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader title="Inventory" description="Search, filter, scan, and manage Florida-only power wheelchair and scooter inventory." />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div key={refreshKey}>
          <InventoryTable />
        </div>
        <EquipmentForm onCreated={() => setRefreshKey((key) => key + 1)} />
      </div>
    </>
  );
}
