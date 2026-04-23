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
import type { ServiceTicket } from "@/src/types/domain";

export default function TicketsScreen() {
  const tickets = useAsyncResource<ServiceTicket[]>(useCallback(() => apiGet("/service-tickets?limit=40&offset=0"), []));

  if (tickets.isLoading && !tickets.data) {
    return <LoadingView label="Loading service tickets..." />;
  }

  return (
    <AppScreen>
      <SectionHeading title="Service Tickets" subtitle="Update repair status, notes, and completion from a phone-ready workflow." />
      <Button label="Refresh" variant="secondary" onPress={() => void tickets.refresh()} />
      {tickets.error ? <ErrorBanner message={tickets.error} /> : null}
      {tickets.data?.length ? (
        tickets.data.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(`/(app)/tickets/${item.id}`)} style={styles.pressable}>
            <Card>
              <Badge label={humanize(item.priority)} tone={item.priority === "urgent" ? "danger" : item.priority === "high" ? "warning" : "primary"} />
              <Text style={styles.title}>{item.ticket_number || item.id.slice(0, 8)}</Text>
              <Text style={styles.body}>{item.equipment?.serial_number ?? item.equipment_id}</Text>
              <Text style={styles.meta}>{humanize(item.status)} / Opened {formatDateTime(item.opened_at)}</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyState title="No open tickets" message="Service tickets will appear here after they are created from equipment or assignment workflows." />
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
