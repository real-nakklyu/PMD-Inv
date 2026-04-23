import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { colors, spacing } from "@/src/constants/theme";

type LabelShortcutCardProps = {
  equipmentId: string;
  primaryText: string;
  secondaryText?: string | null;
};

export function LabelShortcutCard({
  equipmentId,
  primaryText,
  secondaryText,
}: LabelShortcutCardProps) {
  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons color="#2563eb" name="qr-code-outline" size={20} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Equipment Label Packet</Text>
          <Text style={styles.subtitle}>
            Open the same equipment label flow used on the web app, with QR, serial, patient, and field details.
          </Text>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={styles.primary}>{primaryText}</Text>
        {secondaryText ? <Text style={styles.secondary}>{secondaryText}</Text> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: "../labels/[equipmentId]",
            params: { equipmentId },
          })
        }
        style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
      >
        <Text style={styles.linkText}>Open Label Preview</Text>
        <Ionicons color={colors.primary} name="chevron-forward" size={18} />
      </Pressable>

      <Button
        label="Open Label Packet"
        onPress={() =>
          router.push({
            pathname: "../labels/[equipmentId]",
            params: { equipmentId },
          })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    gap: spacing.md,
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 18,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    gap: 4,
    padding: spacing.md,
  },
  primary: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  secondary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 18,
  },
  linkRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  linkText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.82,
  },
});
