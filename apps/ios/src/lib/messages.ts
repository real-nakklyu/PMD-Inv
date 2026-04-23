import type { MessageThread } from "@/src/types/domain";

export function threadTitle(thread: MessageThread, currentUserId?: string | null) {
  if (thread.thread_type === "group" && thread.title) return thread.title;
  const names = thread.members
    .filter((member) => member.user_id !== currentUserId)
    .map((member) => member.profile?.full_name)
    .filter(Boolean);
  return names.join(", ") || "Conversation";
}
