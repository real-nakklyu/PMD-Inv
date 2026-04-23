"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCheck, ClipboardCheck, MessageCircle, RotateCcw, ShieldCheck, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AttentionNotification, NotificationsResponse, NotificationSeverity } from "@/types/domain";

const seenStorageKey = "pmdinv.seenNotifications";

const severityStyles: Record<NotificationSeverity, string> = {
  critical: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/70 dark:text-red-200",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200",
  info: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-200"
};

const kindIcons = {
  staff_access: ShieldCheck,
  overdue_return: RotateCcw,
  return_inspection: RotateCcw,
  return_restock: RotateCcw,
  service_ticket: ClipboardCheck,
  equipment_repair: Wrench,
  message: MessageCircle
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenIds());
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiGet<NotificationsResponse>("/notifications");
      setData(response);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load notifications.");
    }
  }, []);

  useEffect(() => {
    const firstLoad = window.setTimeout(loadNotifications, 0);
    const refresh = window.setInterval(loadNotifications, 60_000);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(refresh);
    };
  }, [loadNotifications]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const unreadCount = useMemo(() => {
    return (data?.items ?? []).filter((item) => !seenIds.has(item.id)).length;
  }, [data?.items, seenIds]);

  function markAllSeen() {
    const next = new Set([...(data?.items ?? []).map((item) => item.id), ...seenIds]);
    setSeenIds(next);
    window.localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(next).slice(-200)));
  }

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        className="relative h-10 w-10 bg-secondary px-0 text-secondary-foreground hover:bg-secondary/80"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border border-background bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Notifications</div>
              <div className="text-xs text-muted-foreground">{data?.counts.total ?? 0} items need attention</div>
            </div>
            <Button type="button" className="h-8 bg-secondary px-2 text-xs text-secondary-foreground hover:bg-secondary/80" onClick={markAllSeen}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Seen
            </Button>
          </div>

          <div className="max-h-[24rem] overflow-y-auto p-2">
            {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
            {!error && data?.items.length ? (
              data.items.slice(0, 6).map((item) => (
                <NotificationLink key={item.id} item={item} seen={seenIds.has(item.id)} onClick={markAllSeen} />
              ))
            ) : null}
            {!error && data && !data.items.length ? (
              <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Nothing needs attention right now.
              </div>
            ) : null}
            {!error && !data ? <div className="p-4 text-sm text-muted-foreground">Loading notifications...</div> : null}
          </div>

          <div className="border-t border-border p-2">
            <Link
              href="/notifications"
              className="flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-primary transition hover:bg-accent active:translate-y-px"
              onClick={() => setOpen(false)}
            >
              Open notification page
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationList({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenIds());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<NotificationsResponse>("/notifications").then((response) => {
      setData(response);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load notifications.");
    });
  }, []);

  function markAllSeen() {
    const next = new Set([...(data?.items ?? []).map((item) => item.id), ...seenIds]);
    setSeenIds(next);
    window.localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(next).slice(-200)));
  }

  if (error) {
    return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryPill label="Critical" value={data?.counts.critical ?? 0} severity="critical" />
        <SummaryPill label="Warning" value={data?.counts.warning ?? 0} severity="warning" />
        <SummaryPill label="Info" value={data?.counts.info ?? 0} severity="info" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{data?.counts.total ?? 0} current attention items</div>
        <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={markAllSeen}>
          <CheckCheck className="mr-2 h-4 w-4" />
          Mark all seen
        </Button>
      </div>
      <div className={cn("space-y-2", compact && "max-h-96 overflow-y-auto")}>
        {data?.items.length ? data.items.map((item) => (
          <NotificationLink key={item.id} item={item} seen={seenIds.has(item.id)} />
        )) : null}
        {data && !data.items.length ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing needs attention right now.
          </div>
        ) : null}
        {!data ? <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">Loading notifications...</div> : null}
      </div>
    </div>
  );
}

function NotificationLink({ item, seen, onClick }: { item: AttentionNotification; seen: boolean; onClick?: () => void }) {
  const Icon = kindIcons[item.kind];
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex gap-3 rounded-md border border-border bg-card p-3 transition hover:border-primary/40 hover:bg-accent/60 active:translate-y-px",
        !seen && "border-primary/40 shadow-sm"
      )}
    >
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", severityStyles[item.severity])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{item.title}</span>
          {!seen ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{item.message}</span>
        <span className="mt-2 block text-xs font-semibold text-primary">{item.action_label}</span>
      </span>
    </Link>
  );
}

function SummaryPill({ label, value, severity }: { label: string; value: number; severity: NotificationSeverity }) {
  return (
    <div className={cn("rounded-md border p-3", severityStyles[severity])}>
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function readSeenIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = window.localStorage.getItem(seenStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}
