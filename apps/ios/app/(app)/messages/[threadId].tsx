import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Button } from "@/src/components/button";
import { Card } from "@/src/components/card";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { InputField } from "@/src/components/input-field";
import { LoadingView } from "@/src/components/loading-view";
import { SectionHeading } from "@/src/components/section-heading";
import { colors } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet, apiSend } from "@/src/lib/api";
import { formatDateTime } from "@/src/lib/format";
import { threadTitle } from "@/src/lib/messages";
import { useSession } from "@/src/providers/session-provider";
import type { MessageThread, StaffMessage } from "@/src/types/domain";

export default function ThreadDetailScreen() {
  const params = useLocalSearchParams<{ threadId: string }>();
  const { profileMe } = useSession();
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const threads = useAsyncResource<MessageThread[]>(useCallback(() => apiGet("/messages/threads"), []));
  const messages = useAsyncResource<StaffMessage[]>(useCallback(() => apiGet(`/messages/threads/${params.threadId}/messages`), [params.threadId]));

  useEffect(() => {
    const interval = setInterval(() => {
      void messages.refresh();
      void threads.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [messages, threads]);

  const thread = useMemo(
    () => (threads.data ?? []).find((item) => item.id === params.threadId) ?? null,
    [params.threadId, threads.data]
  );

  async function sendMessage() {
    setSendError(null);
    try {
      await apiSend(`/messages/threads/${params.threadId}/messages`, "POST", {
        body: body.trim(),
      });
      setBody("");
      await messages.refresh();
      await threads.refresh();
    } catch (reason) {
      setSendError(reason instanceof Error ? reason.message : "Unable to send message.");
    }
  }

  if (messages.isLoading && !messages.data) {
    return <LoadingView label="Loading conversation..." />;
  }

  return (
    <AppScreen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SectionHeading
          title={thread ? threadTitle(thread, profileMe?.profile?.id) : "Conversation"}
          subtitle="Message delivery uses the existing PMDInv thread and unread-state tables."
        />
        {messages.error ? <ErrorBanner message={messages.error} /> : null}
        {sendError ? <ErrorBanner message={sendError} /> : null}

        {messages.data?.length ? (
          messages.data.map((message) => (
            <Card key={message.id}>
              <Text style={styles.title}>{message.sender?.full_name ?? "Staff member"}</Text>
              <Text style={styles.meta}>{formatDateTime(message.created_at)}</Text>
              <Text style={styles.body}>{message.body || "Attachment-only message"}</Text>
            </Card>
          ))
        ) : (
          <EmptyState title="No messages yet" message="Send the first staff message from below." />
        )}

        <Card>
          <InputField label="Message" value={body} onChangeText={setBody} multiline />
          <Button label="Send Message" onPress={() => void sendMessage()} disabled={!body.trim()} />
        </Card>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  body: {
    color: colors.text,
    lineHeight: 20,
  },
});
