import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";
import { formatConversationTimestamp } from "@/src/lib/format";
import { threadInitials, threadPreview, threadTitle } from "@/src/lib/messages";
import type { MessageThread } from "@/src/types/domain";

type ConversationRowProps = {
  currentUserId?: string | null;
  isActive?: boolean;
  onPress: () => void;
  thread: MessageThread;
};

export function ConversationRow({
  currentUserId,
  isActive = false,
  onPress,
  thread,
}: ConversationRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isActive && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {threadInitials(thread, currentUserId)}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {threadTitle(thread, currentUserId)}
          </Text>
          <Text style={styles.timestamp}>
            {formatConversationTimestamp(
              thread.latest_message?.created_at ?? thread.updated_at
            )}
          </Text>
        </View>

        <View style={styles.previewRow}>
          <Text
            numberOfLines={2}
            style={[
              styles.preview,
              thread.unread_count ? styles.previewUnread : null,
            ]}
          >
            {threadPreview(thread)}
          </Text>

          {thread.unread_count ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadText}>{thread.unread_count}</Text>
            </View>
          ) : (
            <Ionicons
              color={colors.textMuted}
              name="chevron-forward"
              size={18}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 24,
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  rowActive: {
    backgroundColor: "#eef7ff",
  },
  rowPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  avatar: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: "#2563eb",
    fontSize: 17,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  previewRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  preview: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  previewUnread: {
    color: colors.text,
    fontWeight: "600",
  },
  unreadPill: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
});
