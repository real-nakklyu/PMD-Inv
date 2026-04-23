import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { formatDateTime, humanize } from "@/src/lib/format";
import { useSession } from "@/src/providers/session-provider";

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { profileMe, refreshProfile, session, signOut } = useSession();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profileMe?.profile) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  if (profileMe?.can_bootstrap_admin) {
    return <Redirect href="/(auth)/bootstrap" />;
  }

  return (
    <AppScreen>
      <SectionHeading
        title="Pending Approval"
        subtitle="Your Supabase account exists, but a PMDInv admin still needs to approve staff access."
      />
      <Card>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{profileMe?.auth_user.email ?? "Unknown email"}</Text>
        {profileMe?.access_request ? (
          <View style={styles.meta}>
            <Text style={styles.label}>Requested role</Text>
            <Text style={styles.value}>{humanize(profileMe.access_request.requested_role)}</Text>
            <Text style={styles.label}>Submitted</Text>
            <Text style={styles.value}>{formatDateTime(profileMe.access_request.created_at)}</Text>
          </View>
        ) : (
          <Text style={styles.help}>No access request is stored yet. Sign out and submit a request from the access tab if needed.</Text>
        )}
      </Card>
      <Button label="Refresh Access" onPress={() => void refreshProfile().then(() => router.replace("/"))} />
      <Button label="Sign Out" variant="secondary" onPress={() => void signOut().then(() => router.replace("/(auth)/login"))} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    gap: 8,
  },
  help: {
    color: colors.textMuted,
    lineHeight: 20,
  },
});
