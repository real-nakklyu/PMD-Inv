 "use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { AssignedList } from "@/features/equipment/simple-lists";
import { AssignmentForm } from "@/features/workflows/workflow-forms";

export default function AssignedPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader title="Assigned" description="Currently assigned equipment with patient, region, return, and service actions." />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <AssignedList refreshKey={refreshKey} />
        <AssignmentForm onSaved={() => setRefreshKey((key) => key + 1)} />
      </div>
    </>
  );
}
