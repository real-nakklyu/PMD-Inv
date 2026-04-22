"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, ClipboardList, FileText, LayoutDashboard, PackageSearch, RotateCcw, ShieldCheck, Stethoscope, Users, Wrench } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthStatus } from "@/components/layout/auth-status";
import { NotificationCenter } from "@/components/layout/notification-center";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: PackageSearch },
  { href: "/assigned", label: "Assigned", icon: ClipboardList },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/service-tickets", label: "Service", icon: Stethoscope },
  { href: "/repairs", label: "Repairs", icon: Wrench },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/staff", label: "Staff", icon: ShieldCheck }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
                <Icon className={cn("h-4 w-4 text-muted-foreground transition group-hover:text-foreground", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-[17rem]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-background/88 px-4 backdrop-blur-xl md:px-7">
          <div>
            <div className="text-sm font-semibold">Power wheelchair and scooter inventory</div>
            <div className="text-xs font-medium text-muted-foreground">Florida regions only</div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter />
            <AuthStatus />
            <ThemeToggle />
          </div>
        </header>
        <main className="p-4 pb-24 md:p-7 lg:pb-7">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/80 bg-background/95 backdrop-blur-xl lg:hidden">
          {nav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground active:scale-[0.98]", active && "text-primary")}>
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
