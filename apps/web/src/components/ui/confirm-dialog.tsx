"use client";

import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isBusy = false,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 id="confirm-dialog-title" className="text-base font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
          <button type="button" className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onCancel} aria-label="Close dialog" disabled={isBusy}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={onCancel} disabled={isBusy}>
            {cancelLabel}
          </Button>
          <Button type="button" className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
