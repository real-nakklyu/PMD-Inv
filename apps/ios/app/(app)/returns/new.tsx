import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { SectionHeading } from "@/src/components/section-heading";
import { apiSend } from "@/src/lib/api";
import type { ReturnRecord } from "@/src/types/domain";

export default function NewReturnScreen() {
  const params = useLocalSearchParams<{ equipmentId?: string; patientId?: string; assignmentId?: string }>();
  const router = useRouter();
  const [equipmentId, setEquipmentId] = useState(params.equipmentId ?? "");
  const [patientId, setPatientId] = useState(params.patientId ?? "");
  const [assignmentId, setAssignmentId] = useState(params.assignmentId ?? "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate() {
    setIsSubmitting(true);
    setError(null);
    try {
      const record = await apiSend<ReturnRecord>("/returns", "POST", {
        equipment_id: equipmentId,
        patient_id: patientId,
        assignment_id: assignmentId || null,
        pickup_address: pickupAddress || null,
        notes: notes || null,
      });
      router.replace(`/(app)/returns/${record.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create return workflow.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <SectionHeading title="New Return" subtitle="Initiate a return workflow for an assigned unit using the existing PMDInv rules." />
      <Card>
        <InputField label="Equipment ID" value={equipmentId} onChangeText={setEquipmentId} autoCapitalize="none" />
        <InputField label="Patient ID" value={patientId} onChangeText={setPatientId} autoCapitalize="none" />
        <InputField label="Assignment ID" value={assignmentId} onChangeText={setAssignmentId} autoCapitalize="none" />
        <InputField label="Pickup Address" value={pickupAddress} onChangeText={setPickupAddress} />
        <InputField label="Notes" value={notes} onChangeText={setNotes} multiline />
        {error ? <ErrorBanner message={error} /> : null}
        <Button label={isSubmitting ? "Creating..." : "Create Return"} onPress={handleCreate} disabled={isSubmitting || !equipmentId || !patientId} />
      </Card>
    </AppScreen>
  );
}
