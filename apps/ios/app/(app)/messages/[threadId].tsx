import * as DocumentPicker from "expo-document-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";

import {
  DraftMessageAttachment,
  MessageComposer,
} from "@/src/components/message-composer";
import {
  MessageBubble,
  SignedMessageAttachment,
} from "@/src/components/message-bubble";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { LoadingView } from "@/src/components/loading-view";
import { colors, spacing } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet, apiSend } from "@/src/lib/api";
import { formatMessageDay } from "@/src/lib/format";
import { threadTitle } from "@/src/lib/messages";
import { attachmentBucket, makeAttachmentPath } from "@/src/lib/storage-path";
import { supabase } from "@/src/lib/supabase";
import { useSession } from "@/src/providers/session-provider";
import type { MessageThread, StaffMessage } from "@/src/types/domain";

type ThreadListItem =
  | { id: string; label: string; type: "day" }
  | { id: string; message: StaffMessage; showSender: boolean; type: "message" };

export default function ThreadDetailScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ThreadListItem>>(null);
  const params = useLocalSearchParams<{ threadId: string }>();
  const threadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const { profileMe } = useSession();
  const [body, setBody] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftMessageAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [signedAttachments, setSignedAttachments] = useState<
    Record<string, SignedMessageAttachment[]>
  >({});

  const threads = useAsyncResource<MessageThread[]>(
    useCallback(() => apiGet("/messages/threads"), [])
  );
  const messages = useAsyncResource<StaffMessage[]>(
    useCallback(() => apiGet(`/messages/threads/${threadId}/messages`), [threadId])
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void messages.refresh();
      void threads.refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [messages, threads]);

  const thread = useMemo(
    () => (threads.data ?? []).find((item) => item.id === threadId) ?? null,
    [threadId, threads.data]
  );

  const items = useMemo<ThreadListItem[]>(() => {
    const nextItems: ThreadListItem[] = [];
    let lastDay = "";
    let previousSenderId: string | null = null;

    for (const message of messages.data ?? []) {
      const dayLabel = formatMessageDay(message.created_at);
      if (dayLabel !== lastDay) {
        nextItems.push({
          id: `day-${dayLabel}-${message.id}`,
          label: dayLabel,
          type: "day",
        });
        previousSenderId = null;
        lastDay = dayLabel;
      }

      nextItems.push({
        id: message.id,
        message,
        showSender:
          !message.is_mine &&
          (thread?.thread_type === "group" || previousSenderId !== message.sender_id),
        type: "message",
      });
      previousSenderId = message.sender_id;
    }

    return nextItems;
  }, [messages.data, thread?.thread_type]);

  useEffect(() => {
    let cancelled = false;

    async function loadSignedAttachments() {
      const nextEntries = await Promise.all(
        (messages.data ?? []).map(async (message) => {
          const attachments = await Promise.all(
            (message.attachments ?? []).map(async (attachment) => {
              const { data } = await supabase.storage
                .from(attachment.bucket || attachmentBucket)
                .createSignedUrl(attachment.storage_path, 60 * 60);
              return {
                ...attachment,
                url: data?.signedUrl ?? null,
              };
            })
          );
          return [message.id, attachments] as const;
        })
      );

      if (!cancelled) {
        setSignedAttachments(Object.fromEntries(nextEntries));
      }
    }

    void loadSignedAttachments();

    return () => {
      cancelled = true;
    };
  }, [messages.data]);

  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: false });
    }, 80);
    return () => clearTimeout(timer);
  }, [items.length]);

  async function pickAttachments() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: [
        "image/*",
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    });

    if (result.canceled) return;

    setDraftAttachments((current) => {
      const additions = result.assets.map((asset) => ({
        id: `${asset.uri}-${asset.name}`,
        mimeType: asset.mimeType ?? null,
        name: asset.name,
        size: asset.size ?? null,
        uri: asset.uri,
      }));

      const existing = new Set(current.map((item) => item.id));
      return [...current, ...additions.filter((item) => !existing.has(item.id))];
    });
  }

  function removeAttachment(attachmentId: string) {
    setDraftAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId)
    );
  }

  async function sendMessage() {
    const trimmed = body.trim();
    if (!trimmed && !draftAttachments.length) return;

    const queuedBody = body;
    const queuedAttachments = draftAttachments;

    setIsSending(true);
    setSendError(null);
    setBody("");
    setDraftAttachments([]);

    try {
      const message = await apiSend<StaffMessage>(
        `/messages/threads/${threadId}/messages`,
        "POST",
        { body: trimmed }
      );

      let attachmentWarning: string | null = null;

      for (const attachment of queuedAttachments) {
        try {
          const response = await fetch(attachment.uri);
          const blob = await response.blob();
          const path = makeAttachmentPath("message", message.id, attachment.name);

          const { error } = await supabase.storage
            .from(attachmentBucket)
            .upload(path, blob, {
              contentType: attachment.mimeType ?? undefined,
              upsert: false,
            });

          if (error) throw error;

          await apiSend(`/messages/messages/${message.id}/attachments`, "POST", {
            bucket: attachmentBucket,
            file_name: attachment.name,
            file_size: attachment.size,
            mime_type: attachment.mimeType,
            storage_path: path,
          });
        } catch (reason) {
          attachmentWarning =
            reason instanceof Error
              ? reason.message
              : "One or more attachments could not be uploaded.";
        }
      }

      await Promise.all([messages.refresh(), threads.refresh()]);
      if (attachmentWarning) {
        setSendError(`Message sent, but an attachment failed to upload: ${attachmentWarning}`);
      }
    } catch (reason) {
      setBody(queuedBody);
      setDraftAttachments(queuedAttachments);
      setSendError(
        reason instanceof Error ? reason.message : "Unable to send message."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function openAttachment(attachment: SignedMessageAttachment) {
    if (!attachment.url) {
      setSendError("This attachment is not ready yet. Pull to refresh and try again.");
      return;
    }

    await WebBrowser.openBrowserAsync(attachment.url);
  }

  if (messages.isLoading && !messages.data) {
    return <LoadingView label="Loading conversation..." />;
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
      <Stack.Screen
        options={{
          headerBackTitle: "Messages",
          title: thread ? threadTitle(thread, profileMe?.profile?.id) : "Conversation",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        style={styles.keyboard}
      >
        {messages.error ? <ErrorBanner message={messages.error} /> : null}
        {sendError ? <ErrorBanner message={sendError} /> : null}

        <FlatList
          contentContainerStyle={styles.listContent}
          data={items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                message="Send the first staff message from the composer below."
                title="No messages yet"
              />
            </View>
          }
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({
              animated: (messages.data?.length ?? 0) > 0,
            })
          }
          ref={listRef}
          renderItem={({ item }) => {
            if (item.type === "day") {
              return (
                <View style={styles.dayDivider}>
                  <Text style={styles.dayDividerText}>{item.label}</Text>
                </View>
              );
            }

            return (
              <MessageBubble
                attachments={signedAttachments[item.message.id] ?? []}
                message={item.message}
                onOpenAttachment={openAttachment}
                showSender={item.showSender}
              />
            );
          }}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />

        <MessageComposer
          body={body}
          disabled={!thread || isSending}
          draftAttachments={draftAttachments}
          isSending={isSending}
          onAttach={() => void pickAttachments()}
          onChangeBody={setBody}
          onRemoveAttachment={removeAttachment}
          onSend={() => void sendMessage()}
        />
        <View style={{ height: Math.max(insets.bottom, 10) }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: "#f4f5f8",
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing.xl,
  },
  dayDivider: {
    alignItems: "center",
    marginVertical: spacing.sm,
  },
  dayDividerText: {
    backgroundColor: "rgba(31,41,55,0.08)",
    borderRadius: 999,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});
