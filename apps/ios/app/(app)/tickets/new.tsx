import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { apiSend } from "@/src/lib/api";
import { humanize } from "@/src/lib/format";
import type { ServiceTicket } from "@/src/types/domain";

const priorities: ServiceTicket["priority"][] = ["low", "medium", "high", "urgent"];

export default function NewTicketScreen() {
  const params = useLocalSearchParams<{ equipmentId?: string; patientId?: string; assignmentId?: string }>();
  const router = useRouter();
  const [equipmentId, setEquipmentId] = useState(params.equipmentId ?? "");
  const [patientId, setPatientId] = useState(params.patientId ?? "");
  const [assignmentId, setAssignmentId] = useState(params.assignmentId ?? "");
  const [priority, setPriority] = useState<ServiceTicket["priority"]>("medium");
  const [issueDescription, setIssueDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate() {
    setIsSubmitting(true);
    setError(null);
    try {
      const ticket = await apiSend<ServiceTicket>("/service-tickets", "POST", {
        equipment_id: equipmentId,
        patient_id: patientId || null,
        assignment_id: assignmentId || null,
        priority,
        issue_description: issueDescription,
      });
      router.replace(`/(app)/tickets/${ticket.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create service ticket.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <SectionHeading title="New Service Ticket" subtitle="Create a repair or service task against an equipment record using the existing API rules." />
      <Card>
        <InputField label="Equipment ID" value={equipmentId} onChangeText={setEquipmentId} autoCapitalize="none" />
        <InputField label="Patient ID" value={patientId} onChangeText={setPatientId} autoCapitalize="none" />
        <InputField label="Assignment ID" value={assignmentId} onChangeText={setAssignmentId} autoCapitalize="none" />
        <Text style={styles.label}>Priority</Text>
        <View style={styles.priorityRow}>
          {priorities.map((value) => (
            <Pressable key={value} onPress={() => setPriority(value)} style={[styles.priorityChip, priority === value && styles.priorityChipActive]}>
              <Text style={[styles.priorityLabel, priority === value && styles.priorityLabelActive]}>{humanize(value)}</Text>
            </Pressable>
          ))}
        </View>
        <InputField label="Issue Description" value={issueDescription} onChangeText={setIssueDescription} multiline />
        {error ? <ErrorBanner message={error} /> : null}
        <Button label={isSubmitting ? "Creating..." : "Create Ticket"} onPress={handleCreate} disabled={isSubmitting || !equipmentId || issueDescription.trim().length < 5} />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  priorityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  priorityChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  priorityChipActive: {
    backgroundColor: colors.primary,
  },
  priorityLabel: {
    color: colors.text,
    fontWeight: "600",
  },
  priorityLabelActive: {
    color: "#ffffff",
  },
});
