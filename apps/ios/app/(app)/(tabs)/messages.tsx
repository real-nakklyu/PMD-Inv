import { Stack, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ConversationRow } from "@/src/components/conversation-row";
import { EmptyState } from "@/src/components/empty-state";
import { ErrorBanner } from "@/src/components/error-banner";
import { LoadingView } from "@/src/components/loading-view";
import { colors, spacing } from "@/src/constants/theme";
import { useAsyncResource } from "@/src/hooks/use-async-resource";
import { apiGet, apiSend } from "@/src/lib/api";
import { humanize } from "@/src/lib/format";
import { useSession } from "@/src/providers/session-provider";
import type { MessageStaffMember, MessageThread } from "@/src/types/domain";

export default function MessagesScreen() {
  const { profileMe } = useSession();
  const [search, setSearch] = useState("");
  const threads = useAsyncResource<MessageThread[]>(
    useCallback(() => apiGet("/messages/threads"), [])
  );
  const staff = useAsyncResource<MessageStaffMember[]>(
    useCallback(() => apiGet("/messages/staff"), [])
  );

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return threads.data ?? [];

    return (threads.data ?? []).filter((thread) => {
      const names = thread.members
        .map((member) => member.profile?.full_name ?? "")
        .join(" ")
        .toLowerCase();
      const title = thread.title?.toLowerCase() ?? "";
      const preview = thread.latest_message?.body?.toLowerCase() ?? "";
      return names.includes(query) || title.includes(query) || preview.includes(query);
    });
  }, [search, threads.data]);

  const suggestedStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (staff.data ?? [])
      .filter((member) => !member.is_me)
      .filter(
        (member) =>
          !query ||
          member.full_name.toLowerCase().includes(query) ||
          member.role.includes(query)
      )
      .slice(0, 8);
  }, [search, staff.data]);

  async function refreshAll() {
    await Promise.all([threads.refresh(), staff.refresh()]);
  }

  async function startThread(memberIds: string[]) {
    const thread = await apiSend<MessageThread>("/messages/threads", "POST", {
      member_ids: memberIds,
      thread_type: memberIds.length > 1 ? "group" : "direct",
    });
    await threads.refresh();
    router.push(`/(app)/messages/${thread.id}`);
  }

  if (threads.isLoading && !threads.data) {
    return <LoadingView label="Loading staff conversations..." />;
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          title: "Messages",
        }}
      />

      <FlatList
        contentContainerStyle={styles.content}
        data={filteredThreads}
        keyExtractor={(thread) => thread.id}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState
              message="Start a staff conversation from the suggested contacts above."
              title="No conversations yet"
            />
          </View>
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.searchShell}>
              <TextInput
                autoCapitalize="none"
                onChangeText={setSearch}
                placeholder="Search conversations"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                value={search}
              />
            </View>

            {threads.error ? <ErrorBanner message={threads.error} /> : null}
            {staff.error ? <ErrorBanner message={staff.error} /> : null}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Start a Conversation</Text>
              <Text style={styles.sectionSubtitle}>
                Tap a staff member to jump straight into a direct thread.
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={styles.suggestions}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {suggestedStaff.length ? (
                suggestedStaff.map((member) => (
                  <Pressable
                    accessibilityRole="button"
                    key={member.id}
                    onPress={() => void startThread([member.id])}
                    style={({ pressed }) => [
                      styles.suggestionCard,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.suggestionAvatar}>
                      <Text style={styles.suggestionInitials}>
                        {member.full_name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((word) => word[0])
                          .join("")
                          .toUpperCase()}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.suggestionName}>
                      {member.full_name}
                    </Text>
                    <Text style={styles.suggestionRole}>
                      {humanize(member.role)}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <View style={styles.noSuggestions}>
                  <Text style={styles.noSuggestionsText}>No staff matches</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Conversations</Text>
              <Text style={styles.sectionSubtitle}>
                Your latest PMDInv coordination threads.
              </Text>
            </View>
          </View>
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void refreshAll()}
            refreshing={threads.isLoading || staff.isLoading}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <ConversationRow
            currentUserId={profileMe?.profile?.id}
            onPress={() => router.push(`/(app)/messages/${item.id}`)}
            thread={item}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.xl * 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  header: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchShell: {
    backgroundColor: "#eceef2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    color: colors.text,
    fontSize: 16,
  },
  sectionHeader: {
    gap: 4,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  suggestions: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  suggestionCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: 118,
  },
  suggestionAvatar: {
    alignItems: "center",
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  suggestionInitials: {
    color: "#15803d",
    fontSize: 16,
    fontWeight: "800",
  },
  suggestionName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    width: "100%",
  },
  suggestionRole: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  noSuggestions: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    justifyContent: "center",
    minWidth: 180,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  noSuggestionsText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyWrap: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: spacing.lg,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
});
