import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationList } from "@/components/layout/notification-center";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Operational items that need attention, including staff approvals, overdue returns, restock steps, and high-priority service tickets."
      />
      <Card>
        <CardHeader>
          <CardTitle>Attention Queue</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">These are generated from the current live workflow state.</p>
        </CardHeader>
        <CardContent>
          <NotificationList />
        </CardContent>
      </Card>
    </div>
  );
}
