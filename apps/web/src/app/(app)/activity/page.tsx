import { PageHeader } from "@/components/ui/page-header";
import { ActivityList } from "@/features/equipment/simple-lists";

export default function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" description="Audit trail for equipment, patient assignments, returns, repairs, and ticket changes." />
      <ActivityList />
    </>
  );
}
