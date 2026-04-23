import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.lg,
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
