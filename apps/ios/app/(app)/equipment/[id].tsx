import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { LabelShortcutCard } from "@/src/components/label-shortcut-card";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet } from "@/src/lib/api";
import { currency, formatDateTime, humanize } from "@/src/lib/format";
import type { EquipmentDetailData } from "@/src/types/domain";

export default function EquipmentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const equipmentDetail = useAsyncResource<EquipmentDetailData>(useCallback(() => apiGet(`/equipment/${params.id}/detail`), [params.id]));

  if (equipmentDetail.isLoading && !equipmentDetail.data) {
    return <LoadingView label="Loading equipment..." />;
  }

  if (!equipmentDetail.data) {
    return (
      <AppScreen>
        <ErrorBanner message={equipmentDetail.error || "Equipment not found."} />
      </AppScreen>
    );
  }

  const { equipment, assignments, returns, service_tickets: tickets, activity } = equipmentDetail.data;
  const activeAssignment = assignments.find((assignment) => assignment.status === "active" || assignment.status === "return_in_progress");

  return (
    <AppScreen>
      <SectionHeading title={equipment.serial_number} subtitle={`${equipment.make} ${equipment.model} / ${humanize(equipment.equipment_type)}`} />
      <Card>
        <Badge label={humanize(equipment.status)} tone={equipment.status === "available" ? "success" : equipment.status === "in_repair" ? "warning" : "primary"} />
        <Text style={styles.meta}>Region: {equipment.region}</Text>
        <Text style={styles.meta}>Purchase price: {currency(equipment.bought_price)}</Text>
        <Text style={styles.meta}>Added {formatDateTime(equipment.created_at)}</Text>
        {equipment.notes ? <Text style={styles.body}>{equipment.notes}</Text> : null}
      </Card>

      <Button
        label="Create Service Ticket"
        onPress={() => router.push(`/(app)/tickets/new?equipmentId=${equipment.id}${activeAssignment?.patient_id ? `&patientId=${activeAssignment.patient_id}` : ""}${activeAssignment?.id ? `&assignmentId=${activeAssignment.id}` : ""}`)}
      />
      {activeAssignment ? (
        <Button
          label="Start Return"
          variant="secondary"
          onPress={() =>
            router.push(
              `/(app)/returns/new?equipmentId=${equipment.id}&patientId=${activeAssignment.patient_id}&assignmentId=${activeAssignment.id}`
            )
          }
        />
      ) : null}

      <LabelShortcutCard
        equipmentId={equipment.id}
        primaryText={`${equipment.serial_number} / ${equipment.make} ${equipment.model}`}
        secondaryText={
          activeAssignment?.patients?.full_name
            ? `Currently assigned to ${activeAssignment.patients.full_name}`
            : "Not currently assigned to a patient"
        }
      />

      <Card>
        <Text style={styles.heading}>Current Assignment</Text>
        {activeAssignment ? (
          <>
            <Text style={styles.title}>{activeAssignment.patients?.full_name ?? "Unknown patient"}</Text>
            <Text style={styles.meta}>Assigned {formatDateTime(activeAssignment.assigned_at)}</Text>
            <Text style={styles.meta}>Status: {humanize(activeAssignment.status)}</Text>
          </>
        ) : (
          <EmptyState title="No active assignment" message="This equipment is not currently assigned to a patient." />
        )}
      </Card>

      <Card>
        <Text style={styles.heading}>Recent Returns</Text>
        {returns.length ? (
          returns.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.stack}>
              <Text style={styles.title}>{humanize(item.status)}</Text>
              <Text style={styles.meta}>{item.patients?.full_name ?? "Unknown patient"}</Text>
              <Text style={styles.meta}>{formatDateTime(item.requested_at)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No returns recorded" message="Return workflows will show up here after pickup or restock activity starts." />
        )}
      </Card>

      <Card>
        <Text style={styles.heading}>Service Tickets</Text>
        {tickets.length ? (
          tickets.slice(0, 4).map((ticket) => (
            <View key={ticket.id} style={styles.stack}>
              <Text style={styles.title}>{ticket.ticket_number || ticket.id.slice(0, 8)}</Text>
              <Text style={styles.meta}>{humanize(ticket.priority)} / {humanize(ticket.status)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No tickets" message="Repairs and service history for this unit will appear here." />
        )}
      </Card>

      <Card>
        <Text style={styles.heading}>Recent Activity</Text>
        {activity.length ? (
          activity.slice(0, 6).map((item) => (
            <View key={item.id} style={styles.stack}>
              <Text style={styles.title}>{humanize(item.event_type)}</Text>
              <Text style={styles.meta}>{item.message}</Text>
              <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No activity yet" message="Audit trail events for this unit will appear here." />
        )}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  stack: {
    gap: 4,
  },
});
