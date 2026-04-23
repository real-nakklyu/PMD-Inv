import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/src/providers/session-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <SessionProvider>{children}</SessionProvider>
    </SafeAreaProvider>
  );
}
