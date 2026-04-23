import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";

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
import { ToggleRow } from "@/src/components/toggle-row";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet, apiSend } from "@/src/lib/api";
import { formatDateTime, humanize } from "@/src/lib/format";
import { returnTransitions } from "@/src/lib/returns";
import type { ReturnInspection, ReturnRecord } from "@/src/types/domain";

const emptyInspection = {
  cleaned: false,
  sanitized: false,
  battery_tested: false,
  charger_verified: false,
  damage_found: false,
  repair_ticket_created: false,
  approved_for_restock: false,
  notes: "",
};

export default function ReturnDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const returnResource = useAsyncResource<ReturnRecord>(useCallback(() => apiGet(`/returns/${params.id}`), [params.id]));
  const inspectionResource = useAsyncResource<ReturnInspection | null>(useCallback(() => apiGet(`/returns/${params.id}/inspection`), [params.id]));
  const [note, setNote] = useState("");
  const [inspectionForm, setInspectionForm] = useState(emptyInspection);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inspectionResource.data) return;
    setInspectionForm({
      cleaned: inspectionResource.data.cleaned,
      sanitized: inspectionResource.data.sanitized,
      battery_tested: inspectionResource.data.battery_tested,
      charger_verified: inspectionResource.data.charger_verified,
      damage_found: inspectionResource.data.damage_found,
      repair_ticket_created: inspectionResource.data.repair_ticket_created,
      approved_for_restock: inspectionResource.data.approved_for_restock,
      notes: inspectionResource.data.notes ?? "",
    });
  }, [inspectionResource.data]);

  const nextStatuses = useMemo(() => {
    if (!returnResource.data) return [];
    return returnTransitions[returnResource.data.status];
  }, [returnResource.data]);

  if (returnResource.isLoading && !returnResource.data) {
    return <LoadingView label="Loading return workflow..." />;
  }

  if (!returnResource.data) {
    return (
      <AppScreen>
        <ErrorBanner message={returnResource.error || "Return not found."} />
      </AppScreen>
    );
  }

  async function updateStatus(nextStatus: ReturnRecord["status"]) {
    setError(null);
    try {
      await apiSend(`/returns/${params.id}/status`, "PATCH", {
        status: nextStatus,
        notes: note || null,
      });
      setNote("");
      await returnResource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update return status.");
    }
  }

  async function saveInspection() {
    setError(null);
    try {
      await apiSend(`/returns/${params.id}/inspection`, "PUT", {
        ...inspectionForm,
        notes: inspectionForm.notes || null,
      });
      await inspectionResource.refresh();
      await returnResource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the inspection checklist.");
    }
  }

  return (
    <AppScreen>
      <SectionHeading title={returnResource.data.equipment?.serial_number ?? returnResource.data.equipment_id} subtitle={returnResource.data.patients?.full_name ?? "Return workflow"} />
      <Card>
        <Badge label={humanize(returnResource.data.status)} tone={returnResource.data.status === "cancelled" ? "danger" : "primary"} />
        <Text style={styles.meta}>Requested {formatDateTime(returnResource.data.requested_at)}</Text>
        <Text style={styles.meta}>Pickup address: {returnResource.data.pickup_address || "Not provided"}</Text>
        {returnResource.data.notes ? <Text style={styles.meta}>{returnResource.data.notes}</Text> : null}
      </Card>

      <LabelShortcutCard
        equipmentId={returnResource.data.equipment_id}
        primaryText={`${returnResource.data.equipment?.serial_number ?? returnResource.data.equipment_id} / ${returnResource.data.equipment?.make ?? "Equipment"} ${returnResource.data.equipment?.model ?? ""}`.trim()}
        secondaryText={
          returnResource.data.patients?.full_name
            ? `Return patient: ${returnResource.data.patients.full_name}`
            : "Open the equipment label packet for this return workflow"
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <Card>
        <Text style={styles.heading}>Next Status</Text>
        {nextStatuses.length ? (
          nextStatuses.map((status) => (
            <Button key={status} label={`Mark ${humanize(status)}`} onPress={() => void updateStatus(status)} variant="secondary" />
          ))
        ) : (
          <EmptyState title="No remaining transitions" message="This return is already in a terminal state." />
        )}
        <InputField label="Transition Note" value={note} onChangeText={setNote} multiline />
      </Card>

      <Card>
        <Text style={styles.heading}>Inspection Checklist</Text>
        <ToggleRow label="Cleaned" value={inspectionForm.cleaned} onChange={(value) => setInspectionForm((current) => ({ ...current, cleaned: value }))} />
        <ToggleRow label="Sanitized" value={inspectionForm.sanitized} onChange={(value) => setInspectionForm((current) => ({ ...current, sanitized: value }))} />
        <ToggleRow label="Battery tested" value={inspectionForm.battery_tested} onChange={(value) => setInspectionForm((current) => ({ ...current, battery_tested: value }))} />
        <ToggleRow label="Charger verified" value={inspectionForm.charger_verified} onChange={(value) => setInspectionForm((current) => ({ ...current, charger_verified: value }))} />
        <ToggleRow label="Damage found" value={inspectionForm.damage_found} onChange={(value) => setInspectionForm((current) => ({ ...current, damage_found: value }))} />
        <ToggleRow label="Repair ticket created" value={inspectionForm.repair_ticket_created} onChange={(value) => setInspectionForm((current) => ({ ...current, repair_ticket_created: value }))} />
        <ToggleRow label="Approved for restock" value={inspectionForm.approved_for_restock} onChange={(value) => setInspectionForm((current) => ({ ...current, approved_for_restock: value }))} />
        <InputField label="Inspection Notes" value={inspectionForm.notes} onChangeText={(value) => setInspectionForm((current) => ({ ...current, notes: value }))} multiline />
        <Button label="Save Inspection" onPress={() => void saveInspection()} />
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
  meta: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
