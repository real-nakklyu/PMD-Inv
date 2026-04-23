import { PageHeader } from "@/components/ui/page-header";
import { MessagesClient } from "@/features/messages/messages-client";

export default function MessagesPage() {
  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <PageHeader title="Messages" description="Internal staff conversations, file sharing, photos, and field coordination." />
      </div>
      <MessagesClient />
    </div>
  );
}
