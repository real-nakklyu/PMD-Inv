import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors, spacing } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet } from "@/src/lib/api";
import { currency, formatDateTime, formatDate, humanize } from "@/src/lib/format";
import {
  createEquipmentLabelQrDataUrl,
  getCurrentAssignedPatient,
  getEquipmentRecordUrl,
  printEquipmentLabel,
  shareEquipmentLabelPdf,
} from "@/src/lib/labels";
import type { EquipmentDetailData } from "@/src/types/domain";

export default function EquipmentLabelScreen() {
  const params = useLocalSearchParams<{ equipmentId: string }>();
  const equipmentId = Array.isArray(params.equipmentId)
    ? params.equipmentId[0]
    : params.equipmentId;
  const detail = useAsyncResource<EquipmentDetailData>(
    useCallback(() => apiGet(`/equipment/${equipmentId}/detail`), [equipmentId])
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    let active = true;

    createEquipmentLabelQrDataUrl(equipmentId)
      .then((value) => {
        if (active) setQrDataUrl(value);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [equipmentId]);

  const equipment = detail.data?.equipment;
  const patient = useMemo(() => getCurrentAssignedPatient(detail.data ?? null), [detail.data]);

  async function handleShare() {
    if (!detail.data) return;
    setActionError(null);
    setIsSharing(true);
    try {
      await shareEquipmentLabelPdf(detail.data);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to share the label PDF.");
    } finally {
      setIsSharing(false);
    }
  }

  async function handlePrint() {
    if (!detail.data) return;
    setActionError(null);
    setIsPrinting(true);
    try {
      await printEquipmentLabel(detail.data);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to open the print dialog.");
    } finally {
      setIsPrinting(false);
    }
  }

  if (detail.isLoading && !detail.data) {
    return <LoadingView label="Loading label packet..." />;
  }

  if (!detail.data || !equipment) {
    return (
      <AppScreen>
        <ErrorBanner message={detail.error || "Equipment label not found."} />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Stack.Screen options={{ title: "Label Packet" }} />

      <SectionHeading
        title="Equipment Label Packet"
        subtitle="The same field label model used in the web app, optimized for iPhone preview, AirPrint, and PDF sharing."
      />

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Card>
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>PMDInv Equipment Label</Text>
            <Text style={styles.serial}>{equipment.serial_number}</Text>
            <Text style={styles.model}>
              {equipment.make} {equipment.model}
            </Text>
          </View>
          <View style={styles.chips}>
            <Badge label={humanize(equipment.equipment_type)} tone="info" />
            <Badge label={humanize(equipment.status)} tone="primary" />
            <Badge label={equipment.region} tone="success" />
          </View>
        </View>

        <View style={styles.qrSection}>
          <View style={styles.qrCard}>
            {qrDataUrl ? (
              <Image contentFit="contain" source={{ uri: qrDataUrl }} style={styles.qrImage} />
            ) : (
              <View style={styles.qrFallback}>
                <ActivityIndicator color={colors.primary} />
              </View>
            )}
          </View>
          <Text style={styles.scanText}>Scan to open equipment record</Text>
          <Text style={styles.url}>{getEquipmentRecordUrl(equipment.id)}</Text>
        </View>

        <View style={styles.actions}>
          <Button
            label={isSharing ? "Preparing PDF..." : "Share PDF"}
            onPress={() => void handleShare()}
            disabled={isSharing || isPrinting}
          />
          <Button
            label={isPrinting ? "Opening Print..." : "Print"}
            onPress={() => void handlePrint()}
            variant="secondary"
            disabled={isSharing || isPrinting}
          />
        </View>
      </Card>

      <InfoCard
        rows={[
          ["Serial", equipment.serial_number],
          ["Type", humanize(equipment.equipment_type)],
          ["Make", equipment.make],
          ["Model", equipment.model],
          ["Status", humanize(equipment.status)],
          ["Region", equipment.region],
          ["Bought Price", currency(Number(equipment.bought_price))],
          ["Added", formatDateTime(equipment.added_at)],
          [
            "Assigned",
            equipment.assigned_at ? formatDateTime(equipment.assigned_at) : "Not assigned",
          ],
          ["Repairs", `${detail.data.repair_count} completed`],
        ]}
        title="Equipment Information"
      />

      <InfoCard
        rows={
          patient
            ? [
                ["Full Name", patient.full_name],
                ["Date of Birth", formatDate(patient.date_of_birth)],
                ["Region", patient.region],
                ["Assigned Date", formatDateTime(patient.assigned_at)],
              ]
            : [["Status", "No patient is currently assigned to this equipment."]]
        }
        title="Assigned Patient"
      />

      <Card>
        <Text style={styles.sectionTitle}>Operational Notes</Text>
        <Text style={styles.note}>
          {equipment.notes?.trim() || "No equipment notes recorded."}
        </Text>
      </Card>
    </AppScreen>
  );
}

function InfoCard({
  rows,
  title,
}: {
  rows: [string, string][];
  title: string;
}) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>
        {rows.map(([label, value]) => (
          <View key={`${title}-${label}`} style={styles.gridItem}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: 24,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  heroCopy: {
    gap: 4,
  },
  eyebrow: {
    color: "#ccfbf1",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  serial: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
  },
  model: {
    color: "#ecfeff",
    fontSize: 16,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  qrSection: {
    alignItems: "center",
    gap: spacing.sm,
  },
  qrCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: "center",
    padding: spacing.md,
    width: "100%",
  },
  qrImage: {
    height: 220,
    width: 220,
  },
  qrFallback: {
    alignItems: "center",
    height: 220,
    justifyContent: "center",
    width: 220,
  },
  scanText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  url: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  actions: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  gridItem: {
    minWidth: "46%",
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    marginTop: 4,
  },
  note: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
