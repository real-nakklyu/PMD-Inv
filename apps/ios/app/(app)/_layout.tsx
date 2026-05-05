import { Redirect, Stack } from "expo-router";
import { useColorScheme } from "react-native";

import { darkColors, lightColors } from "@/src/constants/theme";
import { LoadingView } from "@/src/components/loading-view";
import { useSession } from "@/src/providers/session-provider";

export default function AppLayout() {
  const systemScheme = useColorScheme();
  const { isLoading, profileMe, session } = useSession();
  const themeColors = systemScheme === "dark" ? darkColors : lightColors;

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
        headerStyle: { backgroundColor: themeColors.surface },
        headerTintColor: themeColors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: themeColors.background },
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
