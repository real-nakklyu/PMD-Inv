import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";

export function StatTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: "47%",
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  value: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
