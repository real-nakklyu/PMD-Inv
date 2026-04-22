import { ServiceTicketDetail } from "@/features/service-tickets/service-ticket-detail";

export default async function ServiceTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServiceTicketDetail id={id} />;
}
