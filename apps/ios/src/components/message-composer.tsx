import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, spacing } from "@/src/constants/theme";

export type DraftMessageAttachment = {
  id: string;
  mimeType: string | null;
  name: string;
  size: number | null;
  uri: string;
};

type MessageComposerProps = {
  body: string;
  disabled?: boolean;
  draftAttachments: DraftMessageAttachment[];
  isSending?: boolean;
  onAttach: () => void;
  onChangeBody: (value: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSend: () => void;
};

export function MessageComposer({
  body,
  disabled = false,
  draftAttachments,
  isSending = false,
  onAttach,
  onChangeBody,
  onRemoveAttachment,
  onSend,
}: MessageComposerProps) {
  const canSend = !disabled && !isSending && (body.trim() || draftAttachments.length);

  return (
    <View style={styles.shell}>
      {draftAttachments.length ? (
        <View style={styles.attachmentRow}>
          {draftAttachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentChip}>
              <Ionicons color={colors.primary} name="attach" size={14} />
              <Text numberOfLines={1} style={styles.attachmentText}>
                {attachment.name}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => onRemoveAttachment(attachment.id)}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              >
                <Ionicons color={colors.textMuted} name="close" size={14} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={disabled || isSending}
          onPress={onAttach}
          style={({ pressed }) => [
            styles.iconButton,
            disabled || isSending ? styles.disabled : null,
            pressed && !disabled && !isSending ? styles.pressed : null,
          ]}
        >
          <Ionicons color={colors.primary} name="add-circle" size={30} />
        </Pressable>

        <View style={[styles.inputShell, disabled ? styles.disabledInput : null]}>
          <TextInput
            editable={!disabled && !isSending}
            multiline
            onChangeText={onChangeBody}
            placeholder={disabled ? "Choose a conversation" : "Message"}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={body}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canSend}
          onPress={onSend}
          style={({ pressed }) => [
            styles.sendButton,
            canSend ? styles.sendReady : styles.sendDisabled,
            pressed && canSend ? styles.pressed : null,
          ]}
        >
          <Ionicons
            color="#ffffff"
            name={isSending ? "hourglass-outline" : "arrow-up"}
            size={18}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  attachmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  attachmentChip: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachmentText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 180,
  },
  removeButton: {
    borderRadius: 999,
    padding: 2,
  },
  row: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  inputShell: {
    backgroundColor: "#f2f2f7",
    borderRadius: 20,
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  disabledInput: {
    opacity: 0.65,
  },
  input: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 20,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 999,
    height: 34,
    justifyContent: "center",
    marginBottom: 3,
    width: 34,
  },
  sendReady: {
    backgroundColor: "#1e88ff",
  },
  sendDisabled: {
    backgroundColor: "#c7c7cc",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.97 }],
  },
});
