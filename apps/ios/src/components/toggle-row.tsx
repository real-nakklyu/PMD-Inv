import { StyleSheet, Switch, Text, View } from "react-native";

import { colors } from "@/src/constants/theme";

export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primarySoft }} thumbColor={value ? colors.primary : "#f8fafc"} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
});
