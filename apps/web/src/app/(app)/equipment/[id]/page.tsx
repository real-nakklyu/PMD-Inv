import { PageHeader } from "@/components/ui/page-header";
import { EquipmentDetail } from "@/features/equipment/simple-lists";

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title="Equipment Details" description="Core fields, assignment history, return history, service ticket history, repairs, and activity." />
      <EquipmentDetail id={id} />
    </>
  );
}
