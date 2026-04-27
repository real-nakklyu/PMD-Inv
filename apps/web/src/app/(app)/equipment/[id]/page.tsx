import { PageHeader } from "@/components/ui/page-header";
import { EquipmentDetail } from "@/features/equipment/simple-lists";

export default async function EquipmentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const movementPrefill = stringifySearchParams((await searchParams) ?? {});
  return (
    <>
      <PageHeader title="Equipment Details" description="Core fields, assignment history, return history, service ticket history, repairs, and activity." />
      <EquipmentDetail id={id} movementPrefill={movementPrefill} />
    </>
  );
}

function stringifySearchParams(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    } else if (value !== undefined) {
      query.set(key, value);
    }
  }
  return query.toString();
}
