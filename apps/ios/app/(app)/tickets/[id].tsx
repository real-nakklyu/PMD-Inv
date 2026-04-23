import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { LabelShortcutCard } from "@/src/components/label-shortcut-card";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet, apiSend } from "@/src/lib/api";
import { formatDateTime, humanize } from "@/src/lib/format";
import type { ServiceTicket } from "@/src/types/domain";

const priorities: ServiceTicket["priority"][] = ["low", "medium", "high", "urgent"];
const statuses: ServiceTicket["status"][] = ["open", "scheduled", "waiting_parts", "in_progress", "resolved", "closed", "cancelled"];

export default function TicketDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const ticketResource = useAsyncResource<ServiceTicket>(useCallback(() => apiGet(`/service-tickets/${params.id}`), [params.id]));
  const [priority, setPriority] = useState<ServiceTicket["priority"]>("medium");
  const [status, setStatus] = useState<ServiceTicket["status"]>("open");
  const [repairNotes, setRepairNotes] = useState("");
  const [repairCompleted, setRepairCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketResource.data) return;
    setPriority(ticketResource.data.priority);
    setStatus(ticketResource.data.status);
    setRepairNotes(ticketResource.data.repair_notes ?? "");
    setRepairCompleted(ticketResource.data.repair_completed);
  }, [ticketResource.data]);

  if (ticketResource.isLoading && !ticketResource.data) {
    return <LoadingView label="Loading service ticket..." />;
  }

  if (!ticketResource.data) {
    return (
      <AppScreen>
        <ErrorBanner message={ticketResource.error || "Service ticket not found."} />
      </AppScreen>
    );
  }

  async function saveTicket() {
    setError(null);
    try {
      await apiSend(`/service-tickets/${params.id}`, "PATCH", {
        priority,
        status,
        repair_notes: repairNotes || null,
        repair_completed: repairCompleted,
      });
      await ticketResource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update service ticket.");
    }
  }

  return (
    <AppScreen>
      <SectionHeading title={ticketResource.data.ticket_number || ticketResource.data.id.slice(0, 8)} subtitle={ticketResource.data.equipment?.serial_number ?? ticketResource.data.equipment_id} />
      <Card>
        <Badge label={humanize(ticketResource.data.status)} tone={ticketResource.data.status === "closed" || ticketResource.data.status === "cancelled" ? "danger" : "primary"} />
        <Text style={styles.meta}>{humanize(ticketResource.data.priority)} priority</Text>
        <Text style={styles.meta}>Opened {formatDateTime(ticketResource.data.opened_at)}</Text>
        <Text style={styles.issue}>{ticketResource.data.issue_description}</Text>
      </Card>

      <LabelShortcutCard
        equipmentId={ticketResource.data.equipment_id}
        primaryText={`${ticketResource.data.equipment?.serial_number ?? ticketResource.data.equipment_id} / ${ticketResource.data.ticket_number || ticketResource.data.id.slice(0, 8)}`}
        secondaryText={
          ticketResource.data.patients?.full_name
            ? `Linked patient: ${ticketResource.data.patients.full_name}`
            : "Use the equipment label packet while handling this service ticket"
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <Text style={styles.heading}>Update Ticket</Text>
        <Text style={styles.label}>Priority</Text>
        <View style={styles.row}>
          {priorities.map((value) => (
            <Pressable key={value} onPress={() => setPriority(value)} style={[styles.chip, priority === value && styles.chipActive]}>
              <Text style={[styles.chipLabel, priority === value && styles.chipLabelActive]}>{humanize(value)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Status</Text>
        <View style={styles.row}>
          {statuses.map((value) => (
            <Pressable key={value} onPress={() => setStatus(value)} style={[styles.chip, status === value && styles.chipActive]}>
              <Text style={[styles.chipLabel, status === value && styles.chipLabelActive]}>{humanize(value)}</Text>
            </Pressable>
          ))}
        </View>
        <InputField label="Repair Notes" value={repairNotes} onChangeText={setRepairNotes} multiline />
        <Button label={repairCompleted ? "Marked Repair Completed" : "Mark Repair Completed"} variant="secondary" onPress={() => setRepairCompleted((current) => !current)} />
        <Button label="Save Ticket" onPress={() => void saveTicket()} />
      </Card>

      <Card>
        <Text style={styles.heading}>Update History</Text>
        {ticketResource.data.service_ticket_updates?.length ? (
          ticketResource.data.service_ticket_updates.map((item) => (
            <View key={item.id} style={styles.stack}>
              <Text style={styles.title}>{item.status ? humanize(item.status) : "Note"}</Text>
              <Text style={styles.meta}>{item.note}</Text>
              <Text style={styles.meta}>{formatDateTime(item.created_at)}</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No updates yet" message="Status changes and repair notes will collect here over time." />
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
  issue: {
    color: colors.text,
    lineHeight: 22,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipLabel: {
    color: colors.text,
    fontWeight: "600",
  },
  chipLabelActive: {
    color: "#ffffff",
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  stack: {
    gap: 4,
  },
});
