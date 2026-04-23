import { StyleSheet, Text, View } from "react-native";
import { useCallback } from "react";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { StatTile } from "@/src/components/stat-tile";
import { colors, spacing } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { formatDateTime, humanize } from "@/src/lib/format";
import { apiGet } from "@/src/lib/api";
import type { DashboardSummary, NotificationsResponse } from "@/src/types/domain";

export default function DashboardScreen() {
  const summary = useAsyncResource<DashboardSummary>(useCallback(() => apiGet("/dashboard/summary"), []));
  const notifications = useAsyncResource<NotificationsResponse>(useCallback(() => apiGet("/notifications"), []));

  if (summary.isLoading && !summary.data) {
    return <LoadingView label="Loading operations dashboard..." />;
  }

  return (
    <AppScreen>
      <SectionHeading title="Operations Dashboard" subtitle="A quick mobile view of the same inventory, return, and repair signal already running in PMDInv." />
      <Button
        label="Refresh"
        variant="secondary"
        onPress={() => {
          void summary.refresh();
          void notifications.refresh();
        }}
      />

      {summary.error ? <ErrorBanner message={summary.error} /> : null}
      {notifications.error ? <ErrorBanner message={notifications.error} /> : null}

      {summary.data ? (
        <View style={styles.stats}>
          <StatTile label="Available" value={summary.data.available} />
          <StatTile label="Assigned" value={summary.data.assigned} />
          <StatTile label="In Returns" value={summary.data.in_returns_process} />
          <StatTile label="Open Tickets" value={summary.data.open_service_tickets} />
          <StatTile label="Overdue Returns" value={summary.data.overdue_returns} />
          <StatTile label="Completed Repairs" value={summary.data.completed_repairs} />
        </View>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Priority Attention</Text>
        {notifications.data?.items.length ? (
          notifications.data.items.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.row}>
              <Badge label={humanize(item.severity)} tone={severityTone(item.severity)} />
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowBody}>{item.message}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No active alerts" message="Notifications, unread staff messages, and overdue operational items will surface here." />
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Recent Activity</Text>
        {summary.data?.recent_activity.length ? (
          summary.data.recent_activity.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>{humanize(item.event_type)}</Text>
              <Text style={styles.rowBody}>{item.message}</Text>
              <Text style={styles.rowMeta}>{formatDateTime(item.created_at)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No recent activity" message="Recent assignments, returns, repairs, and ticket events will appear here." />
        )}
      </Card>
    </AppScreen>
  );
}

function severityTone(severity: NotificationsResponse["items"][number]["severity"]) {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  row: {
    gap: 6,
    paddingTop: spacing.xs,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  rowBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
