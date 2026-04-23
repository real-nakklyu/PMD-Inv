"use client";

import Link from "next/link";
import { ArrowLeft, FileText, Image as ImageIcon, Loader2, MessageCircle, Paperclip, RefreshCw, Search, Send, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { attachmentBucket, makeAttachmentPath } from "@/lib/storage-path";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";
import { cn, humanize } from "@/lib/utils";
import type { MessageAttachment, MessageStaffMember, MessageThread, StaffMessage } from "@/types/domain";

type SignedAttachment = MessageAttachment & { url: string | null };
type RealtimeStatus = "off" | "connecting" | "connected" | "fallback";
type RealtimePayload = {
  type: "message_created" | "message_sent" | "message_error" | "error";
  temp_id?: string;
  message?: StaffMessage;
};

const messagingWsUrl = process.env.NEXT_PUBLIC_MESSAGING_WS_URL;
const messageUnreadEventName = "pmdinv:message-unread-count";

export function MessagesClient() {
  const [staff, setStaff] = useState<MessageStaffMember[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("thread");
  });
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [signedAttachments, setSignedAttachments] = useState<Record<string, SignedAttachment[]>>({});
  const [staffSearch, setStaffSearch] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(messagingWsUrl ? "connecting" : "off");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedThreadIdRef = useRef<string | null>(selectedThreadId);
  const { toast } = useToast();

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const currentUser = staff.find((member) => member.is_me) ?? null;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unread_count, 0);

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiGet<MessageThread[]>("/messages/threads");
      setThreads(data);
      publishMessageUnreadTotal(data);
      setError(null);
      if (!selectedThreadIdRef.current && data.length && shouldAutoselectThread()) {
        setSelectedThreadId(data[0].id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load conversations.");
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const data = await apiGet<MessageStaffMember[]>("/messages/staff");
      setStaff(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load staff.");
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) setIsLoadingMessages(true);
    try {
      const data = await apiGet<StaffMessage[]>(`/messages/threads/${threadId}/messages`);
      setMessages(data);
      setError(null);
      await loadThreads();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load messages.");
    } finally {
      if (!options.silent) setIsLoadingMessages(false);
    }
  }, [loadThreads]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => {
      loadStaff();
      loadThreads();
    }, 0);
    return () => window.clearTimeout(firstLoad);
  }, [loadStaff, loadThreads]);

  const handleRealtimePayload = useCallback((payload: RealtimePayload) => {
    if (payload.type === "message_error") {
      if (payload.temp_id) {
        setMessages((current) => current.filter((message) => message.id !== payload.temp_id));
      }
      toast({ kind: "error", title: "Realtime message failed", description: "The message was not delivered." });
      return;
    }

    if (!payload.message) return;
    const incoming = payload.type === "message_sent" ? { ...payload.message, is_mine: true } : payload.message;
    if (incoming.thread_id !== selectedThreadIdRef.current) {
      loadThreads();
      return;
    }

    setMessages((current) => {
      if (payload.temp_id && current.some((message) => message.id === payload.temp_id)) {
        return current.map((message) => message.id === payload.temp_id ? incoming : message);
      }
      if (current.some((message) => message.id === incoming.id)) return current;
      return [...current, incoming];
    });
    loadThreads();
  }, [loadThreads, toast]);

  useEffect(() => {
    const configuredMessagingWsUrl = messagingWsUrl;
    if (!configuredMessagingWsUrl || !hasSupabaseBrowserEnv()) {
      const fallback = window.setTimeout(() => setRealtimeStatus("off"), 0);
      return () => window.clearTimeout(fallback);
    }

    if (!configuredMessagingWsUrl) {
      return;
    }
    const websocketUrl = configuredMessagingWsUrl;

    let closed = false;

    async function connect() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setRealtimeStatus("fallback");
          return;
        }

        const url = new URL(websocketUrl);
        url.searchParams.set("token", token);
        const socket = new WebSocket(url.toString());
        socketRef.current = socket;
        setRealtimeStatus("connecting");

        socket.onopen = () => {
          if (closed) return;
          setRealtimeStatus("connected");
          const threadId = selectedThreadIdRef.current;
          if (threadId) socket.send(JSON.stringify({ type: "join_thread", thread_id: threadId }));
        };

        socket.onmessage = (event) => {
          try {
            handleRealtimePayload(JSON.parse(String(event.data)) as RealtimePayload);
          } catch {
            // Ignore malformed realtime events.
          }
        };

        socket.onerror = () => {
          if (!closed) setRealtimeStatus("fallback");
        };

        socket.onclose = () => {
          if (!closed) setRealtimeStatus("fallback");
        };
      } catch {
        if (!closed) setRealtimeStatus("fallback");
      }
    }

    connect();

    return () => {
      closed = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [handleRealtimePayload]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
    const socket = socketRef.current;
    if (selectedThreadId && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "join_thread", thread_id: selectedThreadId }));
    }
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }
    const firstLoad = window.setTimeout(() => loadMessages(selectedThreadId), 0);
    const refresh = window.setInterval(() => loadMessages(selectedThreadId, { silent: true }), 15_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(refresh);
    };
  }, [loadMessages, selectedThreadId]);

  useEffect(() => {
    async function signAttachments() {
      if (!hasSupabaseBrowserEnv()) return;
      const supabase = createSupabaseBrowserClient();
      const entries = await Promise.all(messages.map(async (message) => {
        const signed = await Promise.all((message.attachments ?? []).map(async (attachment) => {
          const { data } = await supabase.storage.from(attachment.bucket || attachmentBucket).createSignedUrl(attachment.storage_path, 60 * 60);
          return { ...attachment, url: data?.signedUrl ?? null };
        }));
        return [message.id, signed] as const;
      }));
      setSignedAttachments(Object.fromEntries(entries));
    }
    signAttachments();
  }, [messages]);

  const filteredStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    return staff
      .filter((member) => !member.is_me)
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.role.includes(query));
  }, [staff, staffSearch]);

  async function startThread(memberIds: string[], options?: { title?: string; thread_type?: "direct" | "group" }) {
    try {
      const thread = await apiSend<MessageThread>("/messages/threads", "POST", {
        member_ids: memberIds,
        title: options?.title,
        thread_type: options?.thread_type ?? (memberIds.length > 1 ? "group" : "direct")
      });
      setSelectedThreadId(thread.id);
      await loadThreads();
      await loadMessages(thread.id, { silent: true });
      toast({ kind: "success", title: "Conversation ready", description: threadTitle(thread, currentUser?.id) });
    } catch (reason) {
      toast({ kind: "error", title: "Could not start conversation", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  async function sendMessage() {
    if (!selectedThreadId) return;
    if (!body.trim() && !files.length) {
      toast({ kind: "error", title: "Message is empty", description: "Write a message or attach a file." });
      return;
    }
    setIsSending(true);
    try {
      const sentBody = body;
      const sentFiles = files;
      setBody("");
      setFiles([]);

      const socket = socketRef.current;
      if (sentFiles.length === 0 && socket?.readyState === WebSocket.OPEN && currentUser) {
        const tempId = crypto.randomUUID();
        const now = new Date().toISOString();
        setMessages((current) => [
          ...current,
          {
            id: tempId,
            thread_id: selectedThreadId,
            sender_id: currentUser.id,
            body: sentBody,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            sender: currentUser,
            attachments: [],
            is_mine: true
          }
        ]);
        socket.send(JSON.stringify({ type: "send_message", temp_id: tempId, thread_id: selectedThreadId, body: sentBody }));
        setIsSending(false);
        return;
      }

      const message = await apiSend<StaffMessage>(`/messages/threads/${selectedThreadId}/messages`, "POST", { body: sentBody });
      setMessages((current) => [...current, { ...message, body: sentBody }]);
      setIsSending(false);
      if (sentFiles.length) {
        if (!hasSupabaseBrowserEnv()) {
          throw new Error("Supabase browser environment variables are required for message attachments.");
        }
        const supabase = createSupabaseBrowserClient();
        for (const file of sentFiles) {
          const path = makeAttachmentPath("message", message.id, file.name);
          const { error: uploadError } = await supabase.storage.from(attachmentBucket).upload(path, file, {
            cacheControl: "3600",
            upsert: false
          });
          if (uploadError) throw uploadError;
          await apiSend(`/messages/messages/${message.id}/attachments`, "POST", {
            bucket: attachmentBucket,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            file_size: file.size
          });
        }
        await loadMessages(selectedThreadId, { silent: true });
      }
      loadThreads();
    } catch (reason) {
      setBody((current) => current || body);
      toast({ kind: "error", title: "Could not send message", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSending(false);
    }
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function deleteSelectedThread() {
    if (!selectedThreadId) return;
    try {
      await apiSend(`/messages/threads/${selectedThreadId}`, "DELETE");
      const remaining = threads.filter((thread) => thread.id !== selectedThreadId);
      setThreads(remaining);
      setSelectedThreadId(remaining[0]?.id ?? null);
      setMessages([]);
      setConfirmDeleteOpen(false);
      toast({ kind: "success", title: "Conversation removed", description: "It was removed from your messages." });
      await loadThreads();
    } catch (reason) {
      toast({ kind: "error", title: "Could not remove conversation", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  return (
    <div className="grid h-[calc(100dvh-6rem)] min-h-[34rem] overflow-hidden sm:h-[calc(100vh-13rem)] xl:grid-cols-[360px_1fr] xl:gap-4">
      <Card className={cn("min-h-0 overflow-hidden", selectedThread && "hidden xl:block")}>
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold sm:text-sm">Messages</div>
                <div className="text-xs text-muted-foreground">{totalUnread ? `${totalUnread} unread message${totalUnread === 1 ? "" : "s"}` : "Unread messages stay highlighted."}</div>
              </div>
              <Button type="button" className="h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" onClick={loadThreads} aria-label="Refresh conversations">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {isLoadingThreads ? <div className="p-3 text-sm text-muted-foreground">Loading conversations...</div> : null}
            {!isLoadingThreads && threads.length ? threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition hover:bg-accent/60 active:scale-[0.99]",
                  selectedThreadId === thread.id && "border-primary/50 bg-accent"
                )}
                onClick={() => setSelectedThreadId(thread.id)}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
                  {threadInitials(thread, currentUser?.id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold">{threadTitle(thread, currentUser?.id)}</span>
                    {thread.unread_count ? (
                      <Badge className="shrink-0 rounded-full border-primary/25 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground">
                        {formatUnreadMessages(thread.unread_count)}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">
                    {thread.latest_message?.body || (thread.latest_message ? "Attachment sent" : "No messages yet")}
                  </span>
                </span>
              </button>
            )) : null}
            {!isLoadingThreads && !threads.length ? (
              <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No conversations yet.
              </div>
            ) : null}
          </div>
          <div className="border-t border-border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Start a Chat
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search staff" value={staffSearch} onChange={(event) => setStaffSearch(event.target.value)} />
            </div>
            <Button
              type="button"
              className="mb-3 w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => startThread(filteredStaff.map((member) => member.id), { title: "All Staff", thread_type: "group" })}
              disabled={!filteredStaff.length}
            >
              <Users className="h-4 w-4" />
              Message all visible staff
            </Button>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {filteredStaff.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left transition hover:border-primary/40 hover:bg-accent/60 active:scale-[0.99]"
                  onClick={() => startThread([member.id])}
                >
                  <span>
                    <span className="block text-sm font-medium">{member.full_name}</span>
                    <span className="text-xs text-muted-foreground">{humanize(member.role)}</span>
                  </span>
                  <MessageCircle className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("min-h-0 overflow-hidden", !selectedThread && "hidden xl:block")}>
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              {selectedThread ? (
                <Button type="button" className="h-9 w-9 shrink-0 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80 xl:hidden" onClick={() => setSelectedThreadId(null)} aria-label="Back to conversations">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              ) : null}
              {selectedThread ? (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
                  {threadInitials(selectedThread, currentUser?.id)}
                </span>
              ) : null}
              <div className="min-w-0">
              <div className="truncate text-base font-semibold">{selectedThread ? threadTitle(selectedThread, currentUser?.id) : "Select a conversation"}</div>
              <div className="text-xs text-muted-foreground">
                {selectedThread ? `${selectedThread.members.length} member${selectedThread.members.length === 1 ? "" : "s"}` : "Choose a staff member or conversation to begin."}
              </div>
              </div>
            </div>
            {selectedThread ? (
              <div className="flex items-center gap-2">
                {selectedThread.unread_count ? <Badge className="hidden sm:inline-flex">{formatUnreadMessages(selectedThread.unread_count)}</Badge> : null}
                <Badge className="hidden sm:inline-flex">{realtimeStatus === "connected" ? "Realtime" : "Polling"}</Badge>
                <Badge className="hidden sm:inline-flex">{selectedThread.thread_type}</Badge>
                <Button type="button" className="h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Remove conversation" onClick={() => setConfirmDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          {error ? <div className="m-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 sm:p-4">
            {!selectedThread ? <EmptyMessages /> : null}
            {selectedThread && isLoadingMessages ? <div className="text-sm text-muted-foreground">Loading messages...</div> : null}
            {selectedThread && !isLoadingMessages && messages.length ? messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                attachments={signedAttachments[message.id] ?? []}
              />
            )) : null}
            {selectedThread && !isLoadingMessages && !messages.length ? (
              <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </div>
            ) : null}
          </div>

          <div className="border-t border-border bg-card p-2 sm:p-3 md:p-4">
            {files.length ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/45 px-2.5 py-1.5 text-xs font-medium">
                    <Paperclip className="h-3.5 w-3.5 text-primary" />
                    <span className="max-w-48 truncate">{file.name}</span>
                    <button type="button" className="rounded p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2 rounded-lg border border-border bg-background p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="hidden"
                disabled={!selectedThread || isSending}
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
              <Button
                type="button"
                className="h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80"
                disabled={!selectedThread || isSending}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                className="max-h-28 min-h-9 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={selectedThread ? "Message..." : "Select a conversation first"}
                disabled={!selectedThread || isSending}
                rows={1}
              />
              <Button type="button" className="h-9 w-9 p-0" onClick={sendMessage} disabled={!selectedThread || isSending || (!body.trim() && !files.length)} aria-label="Send message">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <ConfirmDialog
            open={confirmDeleteOpen}
            title="Remove conversation?"
            description={`Are you sure you want to remove ${selectedThread ? threadTitle(selectedThread, currentUser?.id) : "this conversation"} from your messages? Other staff members keep their own copy.`}
            confirmLabel="Remove conversation"
            onCancel={() => setConfirmDeleteOpen(false)}
            onConfirm={deleteSelectedThread}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ message, attachments }: { message: StaffMessage; attachments: SignedAttachment[] }) {
  return (
    <div className={cn("flex", message.is_mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(42rem,88vw)] rounded-lg border px-4 py-3 shadow-sm", message.is_mine ? "border-primary/30 bg-primary text-primary-foreground" : "border-border bg-card")}>
        <div className={cn("mb-1 text-xs font-semibold", message.is_mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {message.sender?.full_name ?? "Staff member"} / {new Date(message.created_at).toLocaleString()}
        </div>
        {message.body ? <div className="whitespace-pre-wrap text-sm leading-6">{message.body}</div> : null}
        {attachments.length ? (
          <div className="mt-3 grid gap-2">
            {attachments.map((attachment) => <AttachmentLink key={attachment.id} attachment={attachment} mine={message.is_mine} />)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AttachmentLink({ attachment, mine }: { attachment: SignedAttachment; mine: boolean }) {
  const isImage = attachment.mime_type?.startsWith("image/");
  return (
    <Link
      href={attachment.url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition active:scale-[0.99]",
        mine ? "border-white/25 bg-white/10 hover:bg-white/15" : "border-border bg-muted/30 hover:bg-muted/60"
      )}
    >
      {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      <span className="min-w-0 flex-1 truncate">{attachment.file_name}</span>
      <Paperclip className="h-3.5 w-3.5" />
    </Link>
  );
}

function EmptyMessages() {
  return (
    <div className="grid min-h-80 place-items-center rounded-md border border-dashed border-border bg-card p-8 text-center">
      <div>
        <MessageCircle className="mx-auto h-8 w-8 text-primary" />
        <div className="mt-3 text-sm font-semibold">Internal staff messaging</div>
        <div className="mt-1 max-w-sm text-sm text-muted-foreground">
          Start a direct message or group conversation to coordinate deliveries, repairs, returns, and field updates.
        </div>
      </div>
    </div>
  );
}

function threadTitle(thread: MessageThread, currentUserId?: string) {
  if (thread.thread_type === "group" && thread.title) return thread.title;
  const names = thread.members
    .filter((member) => member.user_id !== currentUserId)
    .map((member) => member.profile?.full_name)
    .filter(Boolean);
  return names.join(", ") || "Conversation";
}

function threadInitials(thread: MessageThread, currentUserId?: string) {
  const title = threadTitle(thread, currentUserId);
  const words = title.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "C") + (words[1]?.[0] ?? "");
}

function formatUnreadMessages(count: number) {
  return `${count} New Message${count === 1 ? "" : "s"}`;
}

function shouldAutoselectThread() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1280px)").matches;
}

function publishMessageUnreadTotal(threads: MessageThread[]) {
  if (typeof window === "undefined") return;
  const count = threads.reduce((sum, thread) => sum + thread.unread_count, 0);
  window.dispatchEvent(new CustomEvent(messageUnreadEventName, { detail: { count } }));
}
