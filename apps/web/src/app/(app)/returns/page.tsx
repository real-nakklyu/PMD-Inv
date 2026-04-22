 "use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { ReturnsList } from "@/features/equipment/simple-lists";
import { ReturnForm } from "@/features/workflows/workflow-forms";

export default function ReturnsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader title="Returns" description="Track return requests until equipment is received, inspected, restocked, and closed." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <ReturnsList refreshKey={refreshKey} onChanged={() => setRefreshKey((key) => key + 1)} />
        <ReturnForm onSaved={() => setRefreshKey((key) => key + 1)} />
      </div>
    </>
  );
}
