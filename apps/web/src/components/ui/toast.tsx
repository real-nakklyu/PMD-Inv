"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type ToastInput = {
  title: string;
  description?: string;
  kind?: ToastKind;
};

type ToastItem = Required<Pick<ToastInput, "title" | "kind">> & {
  id: string;
  description?: string;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = crypto.randomUUID();
    const item: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      kind: input.kind ?? "info"
    };
    setItems((current) => [item, ...current].slice(0, 4));
    window.setTimeout(() => remove(id), input.kind === "error" ? 6500 : 4200);
  }, [remove]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-20 right-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 lg:bottom-4" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => remove(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "error" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-xl shadow-slate-950/12 backdrop-blur animate-in slide-in-from-bottom-2",
        item.kind === "success" && "border-emerald-300 dark:border-emerald-800",
        item.kind === "error" && "border-red-300 dark:border-red-800",
        item.kind === "info" && "border-border"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 items-center justify-center rounded-md",
          item.kind === "success" && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
          item.kind === "error" && "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200",
          item.kind === "info" && "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{item.title}</div>
        {item.description ? <div className="mt-0.5 text-sm text-muted-foreground">{item.description}</div> : null}
      </div>
      <button
        type="button"
        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
