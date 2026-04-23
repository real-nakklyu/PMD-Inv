import { PageHeader } from "@/components/ui/page-header";
import { MessagesClient } from "@/features/messages/messages-client";

export default function MessagesPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Messages" description="Internal staff conversations, file sharing, photos, and field coordination." />
      <MessagesClient />
    </div>
  );
}
