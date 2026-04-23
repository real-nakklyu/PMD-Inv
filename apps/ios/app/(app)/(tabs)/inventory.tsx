import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors, spacing } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet } from "@/src/lib/api";
import { currency, humanize } from "@/src/lib/format";
import type { EquipmentPage, EquipmentStatus } from "@/src/types/domain";

const filters: { label: string; value: EquipmentStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Available", value: "available" },
  { label: "Assigned", value: "assigned" },
  { label: "Returns", value: "return_in_progress" },
  { label: "Repair", value: "in_repair" },
];

export default function InventoryScreen() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "all">("all");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const loadEquipment = useCallback(() => {
      const params = new URLSearchParams({ limit: "30", offset: "0" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "all") params.set("status", status);
      return apiGet<EquipmentPage>(`/equipment/page?${params.toString()}`);
    }, [debouncedSearch, status]);
  const equipment = useAsyncResource<EquipmentPage>(loadEquipment);

  if (equipment.isLoading && !equipment.data) {
    return <LoadingView label="Loading inventory..." />;
  }

  return (
    <AppScreen>
      <SectionHeading title="Inventory" subtitle="Search and open live equipment records from the same production inventory backend." />
      <InputField label="Search" value={search} onChangeText={setSearch} placeholder="Serial, make, or model" />
      <View style={styles.filterRow}>
        {filters.map((filter) => (
          <Pressable key={filter.value} onPress={() => setStatus(filter.value)} style={[styles.filterChip, status === filter.value && styles.filterChipActive]}>
            <Text style={[styles.filterLabel, status === filter.value && styles.filterLabelActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>
      <Button label="Refresh" variant="secondary" onPress={() => void equipment.refresh()} />
      {equipment.error ? <ErrorBanner message={equipment.error} /> : null}
      {equipment.data?.items.length ? (
        equipment.data.items.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(`/(app)/equipment/${item.id}`)} style={styles.pressable}>
            <Card>
              <Badge label={humanize(item.status)} tone={statusTone(item.status)} />
              <Text style={styles.title}>{item.serial_number}</Text>
              <Text style={styles.body}>{item.make} {item.model}</Text>
              <Text style={styles.meta}>{humanize(item.equipment_type)} / {item.region}</Text>
              <Text style={styles.meta}>Purchase price: {currency(item.bought_price)}</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState title="No equipment found" message="Try a different search or status filter." />
      )}
    </AppScreen>
  );
}

function statusTone(status: EquipmentStatus) {
  if (status === "available") return "success";
  if (status === "in_repair") return "warning";
  if (status === "retired") return "danger";
  return "primary";
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterLabel: {
    color: colors.text,
    fontWeight: "600",
  },
  filterLabelActive: {
    color: "#ffffff",
  },
  pressable: {
    borderRadius: 20,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
