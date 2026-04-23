import { Redirect, Stack } from "expo-router";

import { colors } from "@/src/constants/theme";
import { LoadingView } from "@/src/components/loading-view";
import { useSession } from "@/src/providers/session-provider";

export default function AppLayout() {
  const { isLoading, profileMe, session } = useSession();

  if (isLoading) {
    return <LoadingView label="Loading your workspace..." />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!profileMe?.profile) {
    if (profileMe?.can_bootstrap_admin) return <Redirect href="/(auth)/bootstrap" />;
    return <Redirect href="/(auth)/pending-approval" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="equipment/[id]" options={{ title: "Equipment" }} />
      <Stack.Screen name="labels/[equipmentId]" options={{ title: "Label Packet" }} />
      <Stack.Screen name="returns/[id]" options={{ title: "Return" }} />
      <Stack.Screen name="returns/new" options={{ title: "New Return" }} />
      <Stack.Screen name="tickets/[id]" options={{ title: "Service Ticket" }} />
      <Stack.Screen name="tickets/new" options={{ title: "New Service Ticket" }} />
      <Stack.Screen name="messages/[threadId]" options={{ title: "Conversation" }} />
    </Stack>
  );
}
