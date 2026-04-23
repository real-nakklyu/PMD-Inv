import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/constants/theme";

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "primary" | "danger" | "warning" | "info" | "success";
}) {
  return (
    <View style={[styles.base, toneStyles[tone]]}>
      <Text style={[styles.label, textStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
});

const toneStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.surfaceMuted },
  primary: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.dangerSoft },
  warning: { backgroundColor: colors.warningSoft },
  info: { backgroundColor: colors.infoSoft },
  success: { backgroundColor: colors.successSoft },
});

const textStyles = StyleSheet.create({
  neutral: { color: colors.text },
  primary: { color: colors.primary },
  danger: { color: colors.danger },
  warning: { color: colors.warning },
  info: { color: colors.info },
  success: { color: colors.success },
});
