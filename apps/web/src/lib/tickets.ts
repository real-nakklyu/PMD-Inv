import type { ServiceTicket } from "@/types/domain";

export function ticketDisplayNumber(ticket: Pick<ServiceTicket, "id" | "opened_at" | "ticket_number">) {
  if (ticket.ticket_number) return ticket.ticket_number;
  const date = new Date(ticket.opened_at);
  const stamp = Number.isNaN(date.getTime())
    ? "000000"
    : `${date.getFullYear().toString().slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `ST-${stamp}-${ticket.id.slice(0, 6).toUpperCase()}`;
}
