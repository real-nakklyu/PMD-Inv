import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something needs attention</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.dangerSoft,
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    gap: 4,
  },
  title: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
});
