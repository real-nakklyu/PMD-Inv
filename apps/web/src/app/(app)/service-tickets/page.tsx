 "use client";

import { useState } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { TicketsList } from "@/features/equipment/simple-lists";
import { ServiceTicketForm } from "@/features/workflows/workflow-forms";

export default function ServiceTicketsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <>
      <PageHeader title="Service Tickets" description="Open, schedule, repair, and close service work with full repair history." />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <TicketsList refreshKey={refreshKey} onChanged={() => setRefreshKey((key) => key + 1)} />
        <ServiceTicketForm onSaved={() => setRefreshKey((key) => key + 1)} />
      </div>
    </>
  );
}
