import { Redirect, useRouter } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { formatDateTime, humanize } from "@/src/lib/format";
import { fetchBackendHealth, getMobileRuntimeSummary } from "@/src/lib/health";
import { useSession } from "@/src/providers/session-provider";

export default function AccountScreen() {
  const router = useRouter();
  const { profileMe, refreshProfile, session, signOut } = useSession();
  const health = useAsyncResource(useCallback(() => fetchBackendHealth(), []));
  const runtime = getMobileRuntimeSummary();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <AppScreen>
      <SectionHeading title="Account" subtitle="Your PMDInv staff identity comes from Supabase Auth plus the internal staff profile table." />
      <Card>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{profileMe?.profile?.full_name ?? "Pending approval"}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{profileMe?.auth_user.email ?? "Unknown"}</Text>
        {profileMe?.profile ? <Badge label={humanize(profileMe.profile.role)} tone="primary" /> : null}
      </Card>
      <Card>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Device Readiness</Text>
          <Badge
            label={health.data?.status === "ok" ? "Backend Ready" : health.error ? "Check Needed" : "Checking"}
            tone={health.data?.status === "ok" ? "success" : health.error ? "warning" : "info"}
          />
        </View>
        <Text style={styles.label}>App</Text>
        <Text style={styles.value}>{runtime.appName}</Text>
        <Text style={styles.label}>Build Profile</Text>
        <Text style={styles.value}>{humanize(runtime.profile)}</Text>
        <Text style={styles.label}>Version</Text>
        <Text style={styles.value}>{runtime.version}</Text>
        <Text style={styles.label}>API Host</Text>
        <Text style={styles.value}>{runtime.apiHost}</Text>
        <Text style={styles.label}>Supabase Host</Text>
        <Text style={styles.value}>{runtime.supabaseHost}</Text>
        <Text style={styles.label}>Realtime Messaging</Text>
        <Text style={styles.value}>{runtime.messagingConfigured ? "Configured" : "Not configured"}</Text>
        {health.data ? (
          <>
            <Text style={styles.label}>Backend Service</Text>
            <Text style={styles.value}>{health.data.service ?? "PMDInv API"}</Text>
            <Text style={styles.label}>Last Checked</Text>
            <Text style={styles.value}>{formatDateTime(health.data.checked_at)}</Text>
          </>
        ) : null}
        {health.error ? <ErrorBanner message={health.error} /> : null}
      </Card>
      <Button
        label="Refresh Access"
        variant="secondary"
        onPress={() => {
          void refreshProfile();
        }}
      />
      <Button
        label="Check Backend"
        variant="secondary"
        onPress={() => {
          void health.refresh();
        }}
      />
      <Button label="Sign Out" onPress={() => void signOut().then(() => router.replace("/(auth)/login"))} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
