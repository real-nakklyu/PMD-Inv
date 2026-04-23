import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { AppScreen } from "@/src/components/app-screen";
import { Badge } from "@/src/components/badge";
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
import { humanize } from "@/src/lib/format";
import { threadTitle } from "@/src/lib/messages";
import { useSession } from "@/src/providers/session-provider";
import type { MessageStaffMember, MessageThread } from "@/src/types/domain";

export default function MessagesScreen() {
  const { profileMe } = useSession();
  const [search, setSearch] = useState("");
  const threads = useAsyncResource<MessageThread[]>(useCallback(() => apiGet("/messages/threads"), []));
  const staff = useAsyncResource<MessageStaffMember[]>(useCallback(() => apiGet("/messages/staff"), []));

  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (staff.data ?? [])
      .filter((member) => !member.is_me)
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.role.includes(query));
  }, [search, staff.data]);

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
    <AppScreen>
      <SectionHeading title="Messages" subtitle="Direct staff conversations and group coordination run against the same PMDInv messaging backend." />
      <Button
        label="Refresh"
        variant="secondary"
        onPress={() => {
          void threads.refresh();
          void staff.refresh();
        }}
      />
      {threads.error ? <ErrorBanner message={threads.error} /> : null}
      {staff.error ? <ErrorBanner message={staff.error} /> : null}

      <Card>
        <Text style={styles.cardTitle}>Conversations</Text>
        {threads.data?.length ? (
          threads.data.map((thread) => (
            <Pressable key={thread.id} onPress={() => router.push(`/(app)/messages/${thread.id}`)} style={styles.row}>
              <Text style={styles.title}>{threadTitle(thread, profileMe?.profile?.id)}</Text>
              <Text style={styles.meta}>{thread.latest_message?.body || "No messages yet"}</Text>
              {thread.unread_count ? <Badge label={`${thread.unread_count} unread`} tone="info" /> : null}
            </Pressable>
          ))
        ) : (
          <EmptyState title="No conversations yet" message="Start a direct message with another staff member below." />
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Start A Chat</Text>
        <InputField label="Find staff" value={search} onChangeText={setSearch} placeholder="Search by name or role" />
        {filteredStaff.length ? (
          filteredStaff.map((member) => (
            <Pressable key={member.id} onPress={() => void startThread([member.id])} style={styles.row}>
              <Text style={styles.title}>{member.full_name}</Text>
              <Text style={styles.meta}>{humanize(member.role)}</Text>
            </Pressable>
          ))
        ) : (
          <EmptyState title="No staff matches" message="Try another search term or create staff accounts from the main PMDInv admin tools." />
        )}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  row: {
    gap: 6,
    paddingTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
