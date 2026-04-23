import { Redirect, Stack } from "expo-router";

import { LoadingView } from "@/src/components/loading-view";
import { useSession } from "@/src/providers/session-provider";

export default function AuthLayout() {
  const { isLoading, profileMe, session } = useSession();

  if (isLoading) {
    return <LoadingView label="Checking staff access..." />;
  }

  if (session && profileMe?.profile) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
