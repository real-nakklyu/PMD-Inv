"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  Hash,
  Image as ImageIcon,
  ListFilter,
  Loader2,
  MessageCircle,
  MessageSquareText,
  PanelRight,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { attachmentBucket, makeAttachmentPath } from "@/lib/storage-path";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase";
import { cn, humanize, pluralize } from "@/lib/utils";
import type { MessageAttachment, MessageStaffMember, MessageThread, ProfileMe, StaffMessage } from "@/types/domain";

type SignedAttachment = MessageAttachment & { url: string | null };
type RealtimeStatus = "off" | "connecting" | "connected" | "fallback";
type RealtimePayload = {
  type: "message_created" | "message_sent" | "message_error" | "error";
  temp_id?: string;
  message?: StaffMessage;
};
type ConversationFilter = "all" | "unread" | "direct" | "group";
type MessageDensity = "comfortable" | "compact";

const conversationFilters: Array<{ value: ConversationFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "direct", label: "DMs" },
  { value: "group", label: "Groups" }
];

const quickTemplates = [
  {
    label: "Delivery ETA",
    body: "Delivery ETA update: I am en route and will update this thread if the window changes."
  },
  {
    label: "Pickup Blocker",
    body: "Pickup blocker: I need dispatcher help before this can move forward."
  },
  {
    label: "Repair Status",
    body: "Repair status: parts, condition, and next action are updated. Please review when available."
  }
];

const messagingWsUrl = process.env.NEXT_PUBLIC_MESSAGING_WS_URL;
const messageUnreadEventName = "pmdinv:message-unread-count";

export function MessagesClient() {
  const [currentUser, setCurrentUser] = useState<MessageStaffMember | null>(null);
  const [staff, setStaff] = useState<MessageStaffMember[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("thread");
  });
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [signedAttachments, setSignedAttachments] = useState<Record<string, SignedAttachment[]>>({});
  const [staffSearch, setStaffSearch] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>("all");
  const [messageSearch, setMessageSearch] = useState("");
  const [density, setDensity] = useState<MessageDensity>("comfortable");
  const [showConversationDetails, setShowConversationDetails] = useState(true);
  const [showGroupComposer, setShowGroupComposer] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupStaffSearch, setGroupStaffSearch] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [hasLoadedStaff, setHasLoadedStaff] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(messagingWsUrl ? "connecting" : "off");
  const [error, setError] = useState<string | null>(null);
  const [newMessageNotice, setNewMessageNotice] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToLatestRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const selectedThreadIdRef = useRef<string | null>(selectedThreadId);
  const threadsRef = useRef<MessageThread[]>([]);
  const { toast } = useToast();

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const totalUnread = threads.reduce((sum, thread) => sum + thread.unread_count, 0);
  const deferredThreadSearch = useDeferredValue(threadSearch);
  const deferredMessageSearch = useDeferredValue(messageSearch);
  const deferredStaffSearch = useDeferredValue(staffSearch);
  const deferredGroupStaffSearch = useDeferredValue(groupStaffSearch);
  const deferredAddMemberSearch = useDeferredValue(addMemberSearch);

  const filteredThreads = useMemo(() => {
    const query = deferredThreadSearch.trim().toLowerCase();
    return threads.filter((thread) => {
      const matchesFilter =
        conversationFilter === "all" ||
        (conversationFilter === "unread" && thread.unread_count > 0) ||
        thread.thread_type === conversationFilter;
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        threadTitle(thread, currentUser?.id),
        thread.latest_message?.body ?? "",
        ...thread.members.map((member) => member.profile?.full_name ?? "")
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [conversationFilter, currentUser?.id, deferredThreadSearch, threads]);

  const displayedMessages = useMemo(() => {
    const query = deferredMessageSearch.trim().toLowerCase();
    if (!query) return messages;
    return messages.filter((message) => {
      return [
        message.body,
        message.sender?.full_name ?? "",
        ...(message.attachments ?? []).map((attachment) => attachment.file_name)
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [deferredMessageSearch, messages]);

  const conversationStats = useMemo(() => {
    const direct = threads.filter((thread) => thread.thread_type === "direct").length;
    const groups = threads.filter((thread) => thread.thread_type === "group").length;
    const attachments = messages.reduce((count, message) => count + (message.attachments?.length ?? 0), 0);
    return { direct, groups, attachments };
  }, [messages, threads]);

  const sharedAttachments = useMemo(() => {
    return messages.flatMap((message) => (signedAttachments[message.id] ?? []).map((attachment) => ({
      ...attachment,
      sender: message.sender?.full_name ?? "Staff member",
      created_at: message.created_at
    })));
  }, [messages, signedAttachments]);

  const selectedGroupMemberSet = useMemo(() => new Set(selectedGroupMemberIds), [selectedGroupMemberIds]);
  const selectedGroupMembers = useMemo(() => {
    return selectedGroupMemberIds
      .map((memberId) => staff.find((member) => member.id === memberId))
      .filter((member): member is MessageStaffMember => Boolean(member));
  }, [selectedGroupMemberIds, staff]);

  const activeThreadMembers = useMemo(() => {
    return (selectedThread?.members ?? []).filter((member) => !member.deleted_at);
  }, [selectedThread]);

  const activeThreadMemberIds = useMemo(() => {
    return new Set(activeThreadMembers.map((member) => member.user_id));
  }, [activeThreadMembers]);

  const selectedAddMemberSet = useMemo(() => new Set(selectedAddMemberIds), [selectedAddMemberIds]);
  const selectedAddMembers = useMemo(() => {
    return selectedAddMemberIds
      .map((memberId) => staff.find((member) => member.id === memberId))
      .filter((member): member is MessageStaffMember => Boolean(member));
  }, [selectedAddMemberIds, staff]);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = "auto") => {
    const list = messageListRef.current;
    if (!list) return;
    setNewMessageNotice(0);
    window.requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior });
      window.setTimeout(() => list.scrollTo({ top: list.scrollHeight, behavior: "auto" }), 80);
    });
  }, []);

  const updateThreads = useCallback((updater: (current: MessageThread[]) => MessageThread[]) => {
    setThreads((current) => {
      const next = sortThreadsByActivity(updater(current));
      publishMessageUnreadTotal(next);
      return next;
    });
  }, []);

  const syncThreadPreview = useCallback((
    threadId: string,
    message: StaffMessage,
    options: { incrementUnread?: boolean; resetUnread?: boolean } = {}
  ) => {
    if (!threadsRef.current.some((thread) => thread.id === threadId)) {
      return false;
    }

    updateThreads((current) => current.map((thread) => {
      if (thread.id !== threadId) return thread;
      return {
        ...thread,
        latest_message: {
          ...message,
          attachments: message.attachments ?? [],
          sender: message.sender ?? null
        },
        updated_at: message.created_at || thread.updated_at,
        unread_count: options.resetUnread ? 0 : options.incrementUnread ? thread.unread_count + 1 : thread.unread_count
      };
    }));

    return true;
  }, [updateThreads]);

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiGet<MessageThread[]>("/messages/threads");
      const nextThreads = sortThreadsByActivity(data);
      setThreads(nextThreads);
      publishMessageUnreadTotal(nextThreads);
      setError(null);
      if (selectedThreadIdRef.current && !nextThreads.some((thread) => thread.id === selectedThreadIdRef.current)) {
        setSelectedThreadId(nextThreads[0]?.id ?? null);
      } else if (!selectedThreadIdRef.current && nextThreads.length && shouldAutoselectThread()) {
        setSelectedThreadId(nextThreads[0].id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load conversations.");
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  const loadCurrentUser = useCallback(async () => {
    try {
      const data = await apiGet<ProfileMe>("/profiles/me");
      if (data.profile) {
        setCurrentUser({
          id: data.profile.id,
          full_name: data.profile.full_name,
          role: data.profile.role,
          is_me: true
        });
      }
    } catch {
      // Auth gate handles access and session problems globally.
    }
  }, []);

  const loadStaff = useCallback(async () => {
    if (hasLoadedStaff || isLoadingStaff) return;
    setIsLoadingStaff(true);
    try {
      const data = await apiGet<MessageStaffMember[]>("/messages/staff?limit=150");
      setStaff(data);
      setHasLoadedStaff(true);
      if (!currentUser) {
        setCurrentUser(data.find((member) => member.is_me) ?? null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load staff.");
    } finally {
      setIsLoadingStaff(false);
    }
  }, [currentUser, hasLoadedStaff, isLoadingStaff]);

  const loadMessages = useCallback(async (threadId: string, options: { silent?: boolean; scrollToLatest?: boolean } = {}) => {
    if (!options.silent) setIsLoadingMessages(true);
    try {
      const data = await apiGet<StaffMessage[]>(`/messages/threads/${threadId}/messages`);
      if (!options.silent || options.scrollToLatest) shouldScrollToLatestRef.current = true;
      setMessages(data);
      if (options.scrollToLatest) setNewMessageNotice(0);
      setError(null);
      updateThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, unread_count: 0 } : thread));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load messages.");
    } finally {
      if (!options.silent) setIsLoadingMessages(false);
    }
  }, [updateThreads]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => {
      loadCurrentUser();
      loadThreads();
    }, 0);
    return () => window.clearTimeout(firstLoad);
  }, [loadCurrentUser, loadThreads]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

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
      if (!syncThreadPreview(incoming.thread_id, incoming, { incrementUnread: !incoming.is_mine })) {
        void loadThreads();
      }
      return;
    }

    setMessages((current) => {
      if (payload.temp_id && current.some((message) => message.id === payload.temp_id)) {
        shouldScrollToLatestRef.current = true;
        return current.map((message) => message.id === payload.temp_id ? incoming : message);
      }
      if (current.some((message) => message.id === incoming.id)) return current;
      if (incoming.is_mine || isNearMessageListBottom(messageListRef.current)) {
        shouldScrollToLatestRef.current = true;
      } else {
        setNewMessageNotice((count) => count + 1);
      }
      return [...current, incoming];
    });
    syncThreadPreview(incoming.thread_id, incoming, { resetUnread: true });
  }, [loadThreads, syncThreadPreview, toast]);

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
    shouldScrollToLatestRef.current = true;
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
    if (!selectedThreadId || isLoadingMessages || !shouldScrollToLatestRef.current) return;
    shouldScrollToLatestRef.current = false;
    scrollToLatestMessage();
  }, [isLoadingMessages, messages.length, scrollToLatestMessage, selectedThreadId]);

  useEffect(() => {
    let cancelled = false;

    async function signAttachments() {
      if (!hasSupabaseBrowserEnv()) return;
      const messagesWithAttachments = messages.filter((message) => (message.attachments ?? []).length > 0);
      if (!messagesWithAttachments.length) {
        setSignedAttachments({});
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const entries = await Promise.all(messagesWithAttachments.map(async (message) => {
        const signed = await Promise.all((message.attachments ?? []).map(async (attachment) => {
          const { data } = await supabase.storage.from(attachment.bucket || attachmentBucket).createSignedUrl(attachment.storage_path, 60 * 60);
          return { ...attachment, url: data?.signedUrl ?? null };
        }));
        return [message.id, signed] as const;
      }));
      if (!cancelled) setSignedAttachments(Object.fromEntries(entries));
    }

    signAttachments();
    return () => {
      cancelled = true;
    };
  }, [messages]);

  const filteredStaff = useMemo(() => {
    const query = deferredStaffSearch.trim().toLowerCase();
    return staff
      .filter((member) => !member.is_me)
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.role.includes(query));
  }, [deferredStaffSearch, staff]);

  const filteredGroupStaff = useMemo(() => {
    const query = deferredGroupStaffSearch.trim().toLowerCase();
    return staff
      .filter((member) => !member.is_me)
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.role.includes(query))
      .slice(0, 80);
  }, [deferredGroupStaffSearch, staff]);

  const addableStaff = useMemo(() => {
    const query = deferredAddMemberSearch.trim().toLowerCase();
    return staff
      .filter((member) => !member.is_me && !activeThreadMemberIds.has(member.id))
      .filter((member) => !query || member.full_name.toLowerCase().includes(query) || member.role.includes(query))
      .slice(0, 80);
  }, [activeThreadMemberIds, deferredAddMemberSearch, staff]);

  function selectThread(threadId: string | null) {
    setMessageSearch("");
    setNewMessageNotice(0);
    setShowAddMembers(false);
    setAddMemberSearch("");
    setSelectedAddMemberIds([]);
    setSelectedThreadId(threadId);
  }

  function toggleGroupMember(memberId: string) {
    setSelectedGroupMemberIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]);
  }

  function toggleAddMember(memberId: string) {
    setSelectedAddMemberIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]);
  }

  async function createGroupThread() {
    if (!selectedGroupMemberIds.length) {
      toast({ kind: "error", title: "Choose staff", description: "Select at least one staff member for the group." });
      return;
    }
    const title = groupTitle.trim() || groupTitleFromMembers(selectedGroupMembers);
    setIsCreatingGroup(true);
    try {
      const created = await startThread(selectedGroupMemberIds, { title, thread_type: "group" });
      if (created) {
        setGroupTitle("");
        setGroupStaffSearch("");
        setSelectedGroupMemberIds([]);
        setShowGroupComposer(false);
      }
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function addMembersToSelectedGroup() {
    if (!selectedThreadId || !selectedThread || selectedThread.thread_type !== "group") return;
    if (!selectedAddMemberIds.length) {
      toast({ kind: "error", title: "Choose staff", description: "Select at least one staff member to add." });
      return;
    }
    setIsAddingMembers(true);
    try {
      const thread = await apiSend<MessageThread>(`/messages/threads/${selectedThreadId}/members`, "POST", {
        member_ids: selectedAddMemberIds
      });
      updateThreads((current) => current.map((existing) => existing.id === thread.id ? thread : existing));
      setSelectedAddMemberIds([]);
      setAddMemberSearch("");
      setShowAddMembers(false);
      toast({
        kind: "success",
        title: "Group updated",
        description: `${pluralize(selectedAddMemberIds.length, "staff member")} added to ${threadTitle(thread, currentUser?.id)}.`
      });
    } catch (reason) {
      toast({ kind: "error", title: "Could not add staff", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsAddingMembers(false);
    }
  }

  async function startThread(memberIds: string[], options?: { title?: string; thread_type?: "direct" | "group" }) {
    try {
      const thread = await apiSend<MessageThread>("/messages/threads", "POST", {
        member_ids: memberIds,
        title: options?.title,
        thread_type: options?.thread_type ?? (memberIds.length > 1 ? "group" : "direct")
      });
      selectThread(thread.id);
      updateThreads((current) => [thread, ...current.filter((existing) => existing.id !== thread.id)]);
      await loadMessages(thread.id, { silent: true, scrollToLatest: true });
      toast({ kind: "success", title: "Conversation ready", description: threadTitle(thread, currentUser?.id) });
      return true;
    } catch (reason) {
      toast({ kind: "error", title: "Could not start conversation", description: reason instanceof Error ? reason.message : "Please try again." });
      return false;
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
        const optimisticMessage: StaffMessage = {
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
        };
        shouldScrollToLatestRef.current = true;
        setMessages((current) => [...current, optimisticMessage]);
        syncThreadPreview(selectedThreadId, optimisticMessage, { resetUnread: true });
        socket.send(JSON.stringify({ type: "send_message", temp_id: tempId, thread_id: selectedThreadId, body: sentBody }));
        return;
      }

      const message = await apiSend<StaffMessage>(`/messages/threads/${selectedThreadId}/messages`, "POST", { body: sentBody });
      const completeMessage = { ...message, body: sentBody };
      shouldScrollToLatestRef.current = true;
      setMessages((current) => [...current, completeMessage]);
      syncThreadPreview(selectedThreadId, completeMessage, { resetUnread: true });
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
    } catch (reason) {
      setBody((current) => current || body);
      setFiles((current) => current.length ? current : files);
      toast({ kind: "error", title: "Could not send message", description: reason instanceof Error ? reason.message : "Please try again." });
    } finally {
      setIsSending(false);
    }
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) => current.filter((_, index) => index !== indexToRemove));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function insertTemplate(templateBody: string) {
    setBody((current) => current.trim() ? `${current.trim()}\n${templateBody}` : templateBody);
  }

  async function deleteSelectedThread() {
    if (!selectedThreadId) return;
    try {
      await apiSend(`/messages/threads/${selectedThreadId}`, "DELETE");
      const remaining = threads.filter((thread) => thread.id !== selectedThreadId);
      setThreads(remaining);
      publishMessageUnreadTotal(remaining);
      selectThread(remaining[0]?.id ?? null);
      setMessages([]);
      setConfirmDeleteOpen(false);
      toast({ kind: "success", title: "Conversation removed", description: "It was removed from your messages." });
    } catch (reason) {
      toast({ kind: "error", title: "Could not remove conversation", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  return (
    <div className={cn(
      "grid h-[calc(100dvh-6rem)] min-h-[34rem] overflow-hidden sm:h-[calc(100vh-13rem)] xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-4",
      showConversationDetails && "2xl:grid-cols-[360px_minmax(0,1fr)_300px]"
    )}>
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
            <div className="mt-4 grid gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search conversations"
                  value={threadSearch}
                  onChange={(event) => setThreadSearch(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 rounded-md border border-border bg-muted/30 p-1">
                {conversationFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={cn(
                      "min-h-8 rounded px-2 text-xs font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground",
                      conversationFilter === filter.value && "bg-background text-foreground shadow-sm"
                    )}
                    onClick={() => setConversationFilter(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {isLoadingThreads ? <div className="p-3 text-sm text-muted-foreground">Loading conversations...</div> : null}
            {!isLoadingThreads && filteredThreads.length ? filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                aria-current={selectedThreadId === thread.id ? "true" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-3 overflow-hidden rounded-md border border-transparent px-3 py-3 text-left transition hover:bg-accent/60 active:scale-[0.99]",
                  selectedThreadId === thread.id && "border-primary/55 bg-primary/10 shadow-sm shadow-primary/10 ring-1 ring-primary/20 hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20"
                )}
                onClick={() => selectThread(thread.id)}
              >
                {selectedThreadId === thread.id ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden="true" /> : null}
                <span className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold text-primary",
                  selectedThreadId === thread.id && "border-primary/50 bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                )}>
                  {threadInitials(thread, currentUser?.id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold">{threadTitle(thread, currentUser?.id)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatMessageTime(thread.latest_message?.created_at ?? thread.updated_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">
                    {thread.latest_message?.body || (thread.latest_message ? "Attachment sent" : "No messages yet")}
                  </span>
                  <span className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {thread.thread_type === "group" ? <Hash className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                      {thread.thread_type === "group" ? pluralize(thread.members.length, "member") : "Direct"}
                    </span>
                    {thread.unread_count ? (
                      <Badge className="shrink-0 rounded-full border-primary/25 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground">
                        {formatUnreadMessages(thread.unread_count)}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </button>
            )) : null}
            {!isLoadingThreads && !threads.length ? (
              <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No conversations yet.
              </div>
            ) : null}
            {!isLoadingThreads && threads.length && !filteredThreads.length ? (
              <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No conversations match this view.
              </div>
            ) : null}
          </div>
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Start a Chat
              </div>
              <Button
                type="button"
                className="h-8 bg-secondary px-2.5 text-xs text-secondary-foreground hover:bg-secondary/80"
                onClick={async () => {
                  if (!hasLoadedStaff) await loadStaff();
                  setShowGroupComposer((current) => !current);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Group
              </Button>
            </div>
            {showGroupComposer ? (
              <div className="mb-4 rounded-md border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Hash className="h-4 w-4 text-primary" />
                  New Group
                </div>
                <Input
                  className="mb-2"
                  placeholder="Group name"
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                />
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Find staff to add"
                    value={groupStaffSearch}
                    onFocus={() => void loadStaff()}
                    onChange={(event) => {
                      setGroupStaffSearch(event.target.value);
                      if (!hasLoadedStaff) void loadStaff();
                    }}
                  />
                </div>
                {selectedGroupMembers.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {selectedGroupMembers.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                        onClick={() => toggleGroupMember(member.id)}
                      >
                        <span className="max-w-32 truncate">{member.full_name}</span>
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {isLoadingStaff ? <div className="px-2 py-3 text-sm text-muted-foreground">Loading staff...</div> : null}
                  {hasLoadedStaff && !isLoadingStaff ? filteredGroupStaff.map((member) => {
                    const selected = selectedGroupMemberSet.has(member.id);
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-accent/60",
                          selected ? "border-primary/35 bg-primary/10" : "border-transparent"
                        )}
                        onClick={() => toggleGroupMember(member.id)}
                      >
                        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{member.full_name}</span>
                          <span className="text-xs text-muted-foreground">{humanize(member.role)}</span>
                        </span>
                      </button>
                    );
                  }) : null}
                  {hasLoadedStaff && !isLoadingStaff && !filteredGroupStaff.length ? (
                    <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      No staff matched that search.
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={createGroupThread}
                  disabled={isCreatingGroup || isLoadingStaff || selectedGroupMemberIds.length === 0}
                >
                  {isCreatingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                  Create group
                </Button>
              </div>
            ) : null}
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search staff"
                value={staffSearch}
                onFocus={() => void loadStaff()}
                onChange={(event) => {
                  setStaffSearch(event.target.value);
                  if (!hasLoadedStaff) {
                    void loadStaff();
                  }
                }}
              />
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {!hasLoadedStaff ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Tap the search box to load staff.
                </div>
              ) : null}
              {isLoadingStaff ? (
                <div className="rounded-md border border-border bg-muted/25 px-3 py-4 text-sm text-muted-foreground">
                  Loading staff...
                </div>
              ) : null}
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
              {hasLoadedStaff && !isLoadingStaff && !filteredStaff.length ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No staff matched that search.
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("min-h-0 overflow-hidden", !selectedThread && "hidden xl:block")}>
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border p-3 sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              {selectedThread ? (
                <Button type="button" className="h-9 w-9 shrink-0 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80 xl:hidden" onClick={() => selectThread(null)} aria-label="Back to conversations">
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
                  {selectedThread ? `${pluralize(activeThreadMembers.length, "member")} / ${messages.length ? `${pluralize(messages.length, "message")}` : "No messages"}` : "Choose a staff member or conversation to begin."}
                </div>
              </div>
            </div>
            {selectedThread ? (
              <div className="flex items-center gap-2">
                {selectedThread.unread_count ? <Badge className="hidden sm:inline-flex">{formatUnreadMessages(selectedThread.unread_count)}</Badge> : null}
                <Badge className="hidden sm:inline-flex">{realtimeStatus === "connected" ? "Realtime" : "Polling"}</Badge>
                <Badge className="hidden sm:inline-flex">{selectedThread.thread_type}</Badge>
                <Button
                  type="button"
                  className={cn("hidden h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80 2xl:inline-flex", showConversationDetails && "bg-primary/10 text-primary")}
                  aria-label="Toggle conversation details"
                  onClick={() => setShowConversationDetails((current) => !current)}
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
                <Button type="button" className="h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Remove conversation" onClick={() => setConfirmDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          {error ? <div className="m-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          {selectedThread ? (
            <div className="grid gap-3 border-b border-border bg-card px-3 py-3 sm:grid-cols-[1fr_auto] sm:px-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search in conversation"
                  value={messageSearch}
                  onChange={(event) => setMessageSearch(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 rounded-md border border-border bg-muted/30 p-1 sm:w-44">
                {(["comfortable", "compact"] as MessageDensity[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={cn(
                      "min-h-8 rounded px-2 text-xs font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground",
                      density === mode && "bg-background text-foreground shadow-sm"
                    )}
                    onClick={() => setDensity(mode)}
                  >
                    {mode === "comfortable" ? "Comfy" : "Dense"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedThread?.thread_type === "group" ? (
            <div className="border-b border-border bg-card px-3 py-2 sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Add people to this group
                </div>
                <Button
                  type="button"
                  className="h-8 bg-secondary px-2.5 text-xs text-secondary-foreground hover:bg-secondary/80"
                  onClick={async () => {
                    if (!hasLoadedStaff) await loadStaff();
                    setShowAddMembers((current) => !current);
                  }}
                >
                  {showAddMembers ? "Close" : "Add staff"}
                </Button>
              </div>
              {showAddMembers ? (
                <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search available staff"
                      value={addMemberSearch}
                      onFocus={() => void loadStaff()}
                      onChange={(event) => {
                        setAddMemberSearch(event.target.value);
                        if (!hasLoadedStaff) void loadStaff();
                      }}
                    />
                  </div>
                  {selectedAddMembers.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedAddMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                          onClick={() => toggleAddMember(member.id)}
                        >
                          <span className="max-w-36 truncate">{member.full_name}</span>
                          <X className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {isLoadingStaff ? <div className="px-2 py-3 text-sm text-muted-foreground">Loading staff...</div> : null}
                    {hasLoadedStaff && !isLoadingStaff ? addableStaff.map((member) => {
                      const selected = selectedAddMemberSet.has(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition hover:border-primary/40 hover:bg-accent/60",
                            selected ? "border-primary/35 bg-primary/10" : "border-transparent"
                          )}
                          onClick={() => toggleAddMember(member.id)}
                        >
                          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
                            {selected ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{member.full_name}</span>
                            <span className="text-xs text-muted-foreground">{humanize(member.role)}</span>
                          </span>
                        </button>
                      );
                    }) : null}
                    {hasLoadedStaff && !isLoadingStaff && !addableStaff.length ? (
                      <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                        Everyone visible is already in this group.
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={addMembersToSelectedGroup}
                    disabled={isAddingMembers || selectedAddMemberIds.length === 0}
                  >
                    {isAddingMembers ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Add to group
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3 sm:p-4">
            {!selectedThread ? <EmptyMessages /> : null}
            {selectedThread && isLoadingMessages ? <div className="text-sm text-muted-foreground">Loading messages...</div> : null}
            {selectedThread && newMessageNotice ? (
              <button
                type="button"
                className="sticky top-0 z-10 mx-auto flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-md shadow-slate-950/10"
                onClick={() => scrollToLatestMessage("smooth")}
              >
                <Bell className="h-3.5 w-3.5" />
                {formatUnreadMessages(newMessageNotice)}
              </button>
            ) : null}
            {selectedThread && !isLoadingMessages && displayedMessages.length ? displayedMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                attachments={signedAttachments[message.id] ?? []}
                density={density}
              />
            )) : null}
            {selectedThread && !isLoadingMessages && !messages.length ? (
              <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </div>
            ) : null}
            {selectedThread && !isLoadingMessages && messages.length > 0 && !displayedMessages.length ? (
              <div className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No messages match this search.
              </div>
            ) : null}
          </div>

          <div className="border-t border-border bg-card p-2 sm:p-3 md:p-4">
            {selectedThread ? (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {quickTemplates.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-muted/35 px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    onClick={() => insertTemplate(template.body)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {template.label}
                  </button>
                ))}
              </div>
            ) : null}
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

      {selectedThread && showConversationDetails ? (
        <ConversationDetails
          thread={selectedThread}
          currentUserId={currentUser?.id}
          realtimeStatus={realtimeStatus}
          stats={conversationStats}
          attachments={sharedAttachments}
          onTemplate={insertTemplate}
        />
      ) : null}
    </div>
  );
}

function ConversationDetails({
  thread,
  currentUserId,
  realtimeStatus,
  stats,
  attachments,
  onTemplate
}: {
  thread: MessageThread;
  currentUserId?: string;
  realtimeStatus: RealtimeStatus;
  stats: { direct: number; groups: number; attachments: number };
  attachments: Array<SignedAttachment & { sender: string; created_at: string }>;
  onTemplate: (body: string) => void;
}) {
  const activeMembers = thread.members.filter((member) => !member.deleted_at);

  return (
    <Card className="hidden min-h-0 overflow-hidden 2xl:block">
      <CardContent className="flex h-full min-h-0 flex-col p-0">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PanelRight className="h-4 w-4 text-primary" />
            Context
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{threadTitle(thread, currentUserId)}</div>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <ListFilter className="h-3.5 w-3.5" />
              Signals
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Metric icon={<MessageSquareText className="h-4 w-4" />} label="DMs" value={stats.direct} />
              <Metric icon={<Hash className="h-4 w-4" />} label="Groups" value={stats.groups} />
              <Metric icon={<Paperclip className="h-4 w-4" />} label="Files" value={stats.attachments} />
              <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Mode" value={realtimeStatus === "connected" ? "Live" : "Poll"} />
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Members
            </div>
            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(member.profile?.full_name ?? "S").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.profile?.full_name ?? "Staff member"}</span>
                    <span className="block text-xs text-muted-foreground">{member.user_id === currentUserId ? "You" : humanize(member.profile?.role ?? "staff")}</span>
                  </span>
                  {member.last_read_at ? <CheckCheck className="h-4 w-4 text-primary" /> : <Clock3 className="h-4 w-4 text-muted-foreground" />}
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Templates
            </div>
            <div className="grid gap-2">
              {quickTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  className="rounded-md border border-border bg-muted/20 px-3 py-2 text-left text-sm font-semibold transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  onClick={() => onTemplate(template.body)}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              Shared Files
            </div>
            <div className="space-y-2">
              {attachments.slice(0, 6).map((attachment) => (
                <Link
                  key={attachment.id}
                  href={attachment.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-border bg-muted/20 px-3 py-2 text-sm transition hover:border-primary/40 hover:bg-primary/10"
                >
                  <span className="block truncate font-medium">{attachment.file_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{attachment.sender} / {formatMessageTime(attachment.created_at)}</span>
                </Link>
              ))}
              {!attachments.length ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No shared files yet.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 text-primary">{icon}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MessageBubble({ message, attachments, density }: { message: StaffMessage; attachments: SignedAttachment[]; density: MessageDensity }) {
  return (
    <div className={cn("flex", message.is_mine ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[min(42rem,88vw)] rounded-lg border shadow-sm",
        density === "compact" ? "px-3 py-2" : "px-4 py-3",
        message.is_mine ? "border-primary/30 bg-primary text-primary-foreground" : "border-border bg-card"
      )}>
        <div className={cn("mb-1 text-xs font-semibold", message.is_mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {message.sender?.full_name ?? "Staff member"} / {formatMessageTime(message.created_at)}
        </div>
        {message.body ? <div className={cn("whitespace-pre-wrap text-sm", density === "compact" ? "leading-5" : "leading-6")}>{message.body}</div> : null}
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

function groupTitleFromMembers(members: MessageStaffMember[]) {
  const names = members.map((member) => member.full_name.split(" ")[0]).filter(Boolean);
  if (!names.length) return "New Group";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} + ${names.length - 3}`;
}

function threadInitials(thread: MessageThread, currentUserId?: string) {
  const title = threadTitle(thread, currentUserId);
  const words = title.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "C") + (words[1]?.[0] ?? "");
}

function formatUnreadMessages(count: number) {
  return `${count} New Message${count === 1 ? "" : "s"}`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function shouldAutoselectThread() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1280px)").matches;
}

function isNearMessageListBottom(list: HTMLDivElement | null) {
  if (!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight < 140;
}

function sortThreadsByActivity(threads: MessageThread[]) {
  return [...threads].sort((left, right) => {
    const leftTime = left.latest_message?.created_at ?? left.updated_at;
    const rightTime = right.latest_message?.created_at ?? right.updated_at;
    return new Date(rightTime).getTime() - new Date(leftTime).getTime();
  });
}

function publishMessageUnreadTotal(threads: MessageThread[]) {
  if (typeof window === "undefined") return;
  const count = threads.reduce((sum, thread) => sum + thread.unread_count, 0);
  window.dispatchEvent(new CustomEvent(messageUnreadEventName, { detail: { count } }));
}
