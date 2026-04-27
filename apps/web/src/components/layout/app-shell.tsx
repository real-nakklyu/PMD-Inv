"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, CalendarClock, ClipboardList, DatabaseZap, FileText, Gauge, LayoutDashboard, Menu, MessageCircle, NotebookPen, PackageSearch, QrCode, RotateCcw, ShieldCheck, Smartphone, Stethoscope, Users, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthStatus } from "@/components/layout/auth-status";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationCenter } from "@/components/layout/notification-center";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MessageThread } from "@/types/domain";

const messageUnreadEventName = "pmdinv:message-unread-count";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/assigned", label: "Assigned", icon: ClipboardList },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/schedule", label: "Schedule", icon: CalendarClock },
  { href: "/handoff", label: "Handoff", icon: NotebookPen },
  { href: "/field", label: "Field Mode", icon: Smartphone },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/service-tickets", label: "Service", icon: Stethoscope },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/availability", label: "Availability", icon: Gauge },
  { href: "/labels", label: "QR Labels", icon: QrCode },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/quality", label: "Quality", icon: DatabaseZap },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/staff", label: "Staff", icon: ShieldCheck }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const isMessagesPage = pathname.startsWith("/messages");

    async function loadMessageUnreadCount() {
      try {
        const threads = await apiGet<MessageThread[]>("/messages/threads");
        if (!cancelled) {
          setMessageUnreadCount(sumMessageUnreadCount(threads));
        }
      } catch {
        if (!cancelled) {
          setMessageUnreadCount(0);
        }
      }
    }

    function handleMessageUnreadEvent(event: Event) {
      const count = (event as CustomEvent<{ count?: number }>).detail?.count;
      if (typeof count === "number") {
        setMessageUnreadCount(count);
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadMessageUnreadCount();
      }
    }

    window.addEventListener(messageUnreadEventName, handleMessageUnreadEvent);
    if (!isMessagesPage) {
      loadMessageUnreadCount();
      window.addEventListener("focus", loadMessageUnreadCount);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    const refresh = isMessagesPage ? null : window.setInterval(loadMessageUnreadCount, 30_000);

    return () => {
      cancelled = true;
      if (refresh) {
        window.clearInterval(refresh);
      }
      window.removeEventListener(messageUnreadEventName, handleMessageUnreadEvent);
      if (!isMessagesPage) {
        window.removeEventListener("focus", loadMessageUnreadCount);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[17rem] border-r border-border/80 bg-sidebar/95 backdrop-blur lg:block">
        <div className="flex h-16 items-center border-b border-border/80 px-5">
          <div>
            <div className="text-base font-semibold tracking-normal">PMDInv</div>
            <div className="text-xs font-medium text-muted-foreground">Florida DME Operations</div>
          </div>
        </div>
        <nav className="space-y-1 p-3.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href.split("/")[1] ? `/${item.href.split("/")[1]}` : item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-[background,color,box-shadow,transform] hover:bg-sidebar-accent active:translate-y-px",
                  active && "bg-sidebar-accent text-foreground shadow-sm shadow-slate-950/[0.03]"
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground", active && "text-primary")} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.href === "/messages" && messageUnreadCount > 0 ? <MessageUnreadBadge count={messageUnreadCount} /> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-[17rem]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border/80 bg-background/88 px-4 backdrop-blur-xl sm:gap-3 md:px-7">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              className="h-10 w-10 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2 active:scale-[0.99]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-sm font-bold text-primary shadow-sm shadow-primary/10 sm:hidden">
                PM
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-semibold">Power wheelchair and scooter inventory</span>
                <span className="block truncate text-xs font-medium text-muted-foreground">Florida regions only</span>
              </span>
            </Link>
            <div className="min-w-0 sm:hidden">
              <div className="truncate text-sm font-semibold">PMDInv</div>
              <div className="truncate text-[11px] font-medium text-muted-foreground">Florida DME</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GlobalSearch />
            <Link
              href="/messages"
              className={cn(
                "relative grid h-10 w-10 place-items-center rounded-md border border-border bg-secondary text-secondary-foreground transition hover:bg-secondary/80 active:scale-[0.98] lg:hidden",
                pathname.startsWith("/messages") && "border-primary/40 bg-primary/10 text-primary"
              )}
              aria-label={messageUnreadCount ? `Messages, ${messageUnreadCount} unread` : "Messages"}
            >
              <MessageCircle className="h-5 w-5" />
              {messageUnreadCount > 0 ? <MessageUnreadBadge count={messageUnreadCount} compact /> : null}
            </Link>
            <NotificationCenter />
            <AuthStatus />
            <ThemeToggle />
          </div>
        </header>
        <MobileNavigationDrawer
          open={mobileMenuOpen}
          pathname={pathname}
          messageUnreadCount={messageUnreadCount}
          onClose={() => setMobileMenuOpen(false)}
        />
        <main className="p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}

function MobileNavigationDrawer({
  open,
  pathname,
  messageUnreadCount,
  onClose
}: {
  open: boolean;
  pathname: string;
  messageUnreadCount: number;
  onClose: () => void;
}) {
  return (
    <div className={cn("fixed inset-0 z-40 lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <button
        type="button"
        className={cn("absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
        aria-label="Close navigation menu"
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col border-r border-border bg-sidebar shadow-2xl shadow-slate-950/25 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/80 px-4">
          <div>
            <div className="text-base font-semibold tracking-normal">PMDInv</div>
            <div className="text-xs font-medium text-muted-foreground">Florida DME Operations</div>
          </div>
          <Button type="button" className="h-9 w-9 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" onClick={onClose} aria-label="Close navigation menu">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href.split("/")[1] ? `/${item.href.split("/")[1]}` : item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-sidebar-foreground transition-[background,color,transform] hover:bg-sidebar-accent active:translate-y-px",
                  active && "bg-sidebar-accent text-foreground"
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className={cn("h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground", active && "text-primary")} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.href === "/messages" && messageUnreadCount > 0 ? <MessageUnreadBadge count={messageUnreadCount} /> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

function MessageUnreadBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  const label = `${count} unread message${count === 1 ? "" : "s"}`;
  const display = count > 99 ? "99+" : String(count);

  return (
    <span
      aria-label={label}
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-primary-foreground shadow-sm shadow-primary/20 ring-1 ring-primary/25",
        compact && "absolute -right-3 -top-2 h-4 min-w-4 px-1 text-[10px]"
      )}
    >
      {display}
    </span>
  );
}

function sumMessageUnreadCount(threads: MessageThread[]) {
  return threads.reduce((sum, thread) => sum + thread.unread_count, 0);
}
