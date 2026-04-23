import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/constants/theme";

export function LoadingView({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
