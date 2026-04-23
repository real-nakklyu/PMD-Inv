import { router } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useCallback } from "react";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet } from "@/src/lib/api";
import { formatDateTime, humanize } from "@/src/lib/format";
import type { ReturnRecord } from "@/src/types/domain";

export default function ReturnsScreen() {
  const returnsResource = useAsyncResource<ReturnRecord[]>(useCallback(() => apiGet("/returns?limit=40&offset=0"), []));

  if (returnsResource.isLoading && !returnsResource.data) {
    return <LoadingView label="Loading return workflows..." />;
  }

  return (
    <AppScreen>
      <SectionHeading title="Returns" subtitle="Track return workflow state, inspection readiness, and overdue items from the field." />
      <Button label="Refresh" variant="secondary" onPress={() => void returnsResource.refresh()} />
      {returnsResource.error ? <ErrorBanner message={returnsResource.error} /> : null}
      {returnsResource.data?.length ? (
        returnsResource.data.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(`/(app)/returns/${item.id}`)} style={styles.pressable}>
            <Card>
              <Badge label={humanize(item.status)} tone={item.status === "cancelled" ? "danger" : item.status === "received" || item.status === "inspected" ? "warning" : "primary"} />
              <Text style={styles.title}>{item.equipment?.serial_number ?? item.equipment_id}</Text>
              <Text style={styles.body}>{item.patients?.full_name ?? "Unknown patient"}</Text>
              <Text style={styles.meta}>Requested {formatDateTime(item.requested_at)}</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState title="No returns yet" message="Return workflows will show up here once field pickups and received units are being processed." />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
