import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { SectionHeading } from "@/src/components/section-heading";
import { colors, spacing } from "@/src/constants/theme";
import { useSession } from "@/src/providers/session-provider";

type Mode = "signin" | "signup" | "forgot";

export default function LoginScreen() {
  const router = useRouter();
  const { queuePendingAccessRequest, refreshProfile, requestAccess, signIn, signUp, submitQueuedAccessRequest } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLabel = useMemo(() => {
    if (isSubmitting) return "Working...";
    if (mode === "signup") return "Create Account & Request Approval";
    if (mode === "forgot") return "Send Reset Instructions";
    return "Sign In";
  }, [isSubmitting, mode]);

  async function handleSubmit() {
    setIsSubmitting(true);
    setMessage(null);

    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        await submitQueuedAccessRequest();
        await refreshProfile();
        router.replace("/");
        return;
      }

      if (mode === "signup") {
        if (!fullName.trim()) {
          throw new Error("Enter your full name so an admin knows who to approve.");
        }

        const requestPayload = {
          full_name: fullName.trim(),
          requested_role: "viewer" as const,
          message: note.trim() || null,
        };
        const result = await signUp(email.trim(), password, fullName.trim());
        await queuePendingAccessRequest(requestPayload);
        if (!result.hasSession) {
          setMessage("Account created. Confirm your email if Supabase asks you to, then sign in to finish the approval request.");
          setMode("signin");
          return;
        }
        await requestAccess(requestPayload);
        router.replace("/(auth)/pending-approval");
        return;
      }

      setMessage("Password reset is still handled from the web app today. Open PMDInv web to reset a password until the native deep-link flow is added.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to continue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.wrapper}>
          <SectionHeading
            title="PMDInv Mobile"
            subtitle="Secure field access for Florida DME inventory, returns, repairs, and staff coordination."
          />
          <Card>
            <View style={styles.tabs}>
              {(["signin", "signup"] as const).map((value) => (
                <Pressable key={value} onPress={() => setMode(value)} style={[styles.tab, mode === value && styles.tabActive]}>
                  <Text style={[styles.tabLabel, mode === value && styles.tabLabelActive]}>
                    {value === "signin" ? "Sign In" : "Request Access"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {mode === "signup" ? (
              <InputField label="Full Name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
            ) : null}
            <InputField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            {mode !== "forgot" ? (
              <InputField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
            ) : null}
            {mode === "signup" ? (
              <InputField label="Note For Admin" value={note} onChangeText={setNote} placeholder="Role, region, or manager name" />
            ) : null}

            {message ? <ErrorBanner message={message} /> : null}

            <Button label={submitLabel} onPress={handleSubmit} disabled={isSubmitting} />
            <Pressable onPress={() => setMode(mode === "forgot" ? "signin" : "forgot")}>
              <Text style={styles.link}>
                {mode === "forgot" ? "Back to sign in" : "Forgot password?"}
              </Text>
            </Pressable>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabLabel: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: colors.text,
  },
  link: {
    textAlign: "center",
    color: colors.primary,
    fontWeight: "600",
  },
});
