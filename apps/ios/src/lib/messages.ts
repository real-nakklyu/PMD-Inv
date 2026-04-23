import type { MessageThread } from "@/src/types/domain";

export function threadTitle(thread: MessageThread, currentUserId?: string | null) {
  if (thread.thread_type === "group" && thread.title) return thread.title;
  const names = thread.members
    .filter((member) => member.user_id !== currentUserId)
    .map((member) => member.profile?.full_name)
    .filter(Boolean);
  return names.join(", ") || "Conversation";
}

export function threadInitials(thread: MessageThread, currentUserId?: string | null) {
  const title = threadTitle(thread, currentUserId);
  const words = title.split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] ?? "C"}${words[1]?.[0] ?? ""}`.toUpperCase();
}

export function threadPreview(thread: MessageThread) {
  if (thread.latest_message?.body) return thread.latest_message.body;
  if (thread.latest_message) return "Attachment sent";
  return "No messages yet";
}
