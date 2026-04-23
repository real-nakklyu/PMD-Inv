import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";
import { formatMessageTime } from "@/src/lib/format";
import type { MessageAttachment, StaffMessage } from "@/src/types/domain";

export type SignedMessageAttachment = MessageAttachment & { url: string | null };

type MessageBubbleProps = {
  attachments: SignedMessageAttachment[];
  message: StaffMessage;
  onOpenAttachment: (attachment: SignedMessageAttachment) => void;
  showSender?: boolean;
};

export function MessageBubble({
  attachments,
  message,
  onOpenAttachment,
  showSender = false,
}: MessageBubbleProps) {
  const mine = message.is_mine;

  return (
    <View style={[styles.wrapper, mine ? styles.mine : styles.theirs]}>
      {showSender && !mine ? (
        <Text style={styles.sender}>
          {message.sender?.full_name ?? "Staff member"}
        </Text>
      ) : null}

      <View style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>
        {message.body ? (
          <Text style={[styles.body, mine ? styles.mineText : styles.theirText]}>
            {message.body}
          </Text>
        ) : null}

        {attachments.length ? (
          <View style={styles.attachments}>
            {attachments.map((attachment) => {
              const isImage = attachment.mime_type?.startsWith("image/");
              return (
                <Pressable
                  accessibilityRole="button"
                  key={attachment.id}
                  onPress={() => onOpenAttachment(attachment)}
                  style={({ pressed }) => [
                    styles.attachment,
                    mine ? styles.mineAttachment : styles.theirAttachment,
                    pressed && styles.attachmentPressed,
                  ]}
                >
                  <Ionicons
                    color={mine ? "#ffffff" : colors.text}
                    name={isImage ? "image-outline" : "document-outline"}
                    size={16}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.attachmentLabel,
                      mine ? styles.mineText : styles.theirText,
                    ]}
                  >
                    {attachment.file_name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      <Text style={styles.timestamp}>{formatMessageTime(message.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
    maxWidth: "82%",
  },
  mine: {
    alignSelf: "flex-end",
  },
  theirs: {
    alignSelf: "flex-start",
  },
  sender: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: spacing.sm,
  },
  bubble: {
    borderRadius: 24,
    gap: spacing.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mineBubble: {
    backgroundColor: "#1e88ff",
    borderBottomRightRadius: 8,
  },
  theirBubble: {
    backgroundColor: "#e5e5ea",
    borderBottomLeftRadius: 8,
  },
  body: {
    fontSize: 16,
    lineHeight: 21,
  },
  mineText: {
    color: "#ffffff",
  },
  theirText: {
    color: "#111827",
  },
  attachments: {
    gap: spacing.xs,
    marginTop: 2,
  },
  attachment: {
    alignItems: "center",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mineAttachment: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  theirAttachment: {
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  attachmentPressed: {
    opacity: 0.82,
  },
  attachmentLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginHorizontal: spacing.sm,
  },
});
