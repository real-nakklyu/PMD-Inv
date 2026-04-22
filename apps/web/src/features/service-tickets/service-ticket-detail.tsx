"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AttachmentUploader } from "@/components/storage/attachment-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketStatusControl } from "@/features/workflows/workflow-forms";
import { apiGet } from "@/lib/api";
import { ticketDisplayNumber } from "@/lib/tickets";
import { humanize } from "@/lib/utils";
import type { ServiceTicket } from "@/types/domain";

export function ServiceTicketDetail({ id }: { id: string }) {
  const [ticket, setTicket] = useState<ServiceTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    apiGet<ServiceTicket>(`/service-tickets/${id}`).then((item) => {
      setTicket(item);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load service ticket.");
    });
  }

  useEffect(refresh, [id]);

  if (error) return <LoadError message={error} />;
  if (!ticket) return <p className="text-sm text-muted-foreground">Loading service ticket...</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" href="/service-tickets">
            <ArrowLeft className="h-4 w-4" />
            Back to tickets
          </Link>
          <h1 className="text-2xl font-semibold tracking-normal">{ticketDisplayNumber(ticket)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{ticket.equipment ? `${ticket.equipment.serial_number} - ${ticket.equipment.make} ${ticket.equipment.model}` : ticket.equipment_id}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{humanize(ticket.priority)}</Badge>
          <Badge>{humanize(ticket.status)}</Badge>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Detail label="Issue" value={ticket.issue_description} />
            <Detail label="Opened" value={new Date(ticket.opened_at).toLocaleString()} />
            <Detail label="Patient" value={ticket.patients?.full_name ?? "No patient linked"} />
            <Detail label="Repair Notes" value={ticket.repair_notes ?? "No repair notes yet"} />
            <TicketStatusControl ticket={ticket} onSaved={refresh} />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentUploader scope="service-ticket" ownerId={ticket.id} label="Ticket photos / documents" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ticket.service_ticket_updates?.length ? ticket.service_ticket_updates.map((item) => (
                <div key={item.id} className="border-l-2 border-primary pl-3 text-sm">
                  <div>{item.note}</div>
                  <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
                </div>
              )) : <p className="text-sm text-muted-foreground">No updates yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
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
