import { Redirect } from "expo-router";

import { LoadingView } from "@/src/components/loading-view";
import { useSession } from "@/src/providers/session-provider";

export default function IndexRoute() {
  const { isLoading, profileMe, session } = useSession();

  if (isLoading) {
    return <LoadingView label="Preparing PMDInv Mobile..." />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profileMe?.profile) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  if (profileMe?.can_bootstrap_admin) {
    return <Redirect href="/(auth)/bootstrap" />;
  }

  return <Redirect href="/(auth)/pending-approval" />;
}
