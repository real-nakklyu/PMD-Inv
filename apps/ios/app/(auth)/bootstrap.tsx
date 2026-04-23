import { Redirect, useRouter } from "expo-router";
import { useState } from "react";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { SectionHeading } from "@/src/components/section-heading";
import { useSession } from "@/src/providers/session-provider";

export default function BootstrapScreen() {
  const router = useRouter();
  const { bootstrapFirstAdmin, profileMe, session } = useSession();
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (profileMe?.profile) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  if (!profileMe?.can_bootstrap_admin) {
    return <Redirect href="/(auth)/pending-approval" />;
  }

  async function handleBootstrap() {
    setIsSubmitting(true);
    setError(null);
    try {
      await bootstrapFirstAdmin(fullName.trim());
      router.replace("/(app)/(tabs)/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the first admin.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <SectionHeading
        title="Create First Admin"
        subtitle="No PMDInv staff profiles exist yet. Finish setup by creating the first admin directly from the mobile app."
      />
      <Card>
        <InputField label="Full Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
        {error ? <ErrorBanner message={error} /> : null}
        <Button label={isSubmitting ? "Creating..." : "Create First Admin"} onPress={handleBootstrap} disabled={isSubmitting || !fullName.trim()} />
      </Card>
    </AppScreen>
  );
}
