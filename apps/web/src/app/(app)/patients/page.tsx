 "use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PatientsList } from "@/features/equipment/simple-lists";
import { PatientForm } from "@/features/workflows/workflow-forms";

export default function PatientsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader title="Patients" description="Simple patient directory with DOB, region, current equipment, and assignment history." />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <PatientsList refreshKey={refreshKey} />
        <PatientForm onSaved={() => setRefreshKey((key) => key + 1)} />
      </div>
    </>
  );
}
