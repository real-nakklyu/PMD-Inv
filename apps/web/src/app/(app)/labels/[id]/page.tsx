import { EquipmentLabelDetail } from "@/features/operations/equipment-label-detail";

export default async function EquipmentLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EquipmentLabelDetail id={id} />;
}
