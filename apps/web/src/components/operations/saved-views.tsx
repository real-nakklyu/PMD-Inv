"use client";

import { Bookmark, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import type { SavedView } from "@/types/domain";

export function SavedViewsControl({
  page,
  filters,
  onApply
}: {
  page: SavedView["page"];
  filters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { toast } = useToast();

  function refresh() {
    apiGet<SavedView[]>(`/saved-views?page=${page}`).then(setViews).catch(() => undefined);
  }

  useEffect(refresh, [page]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ kind: "error", title: "Name required", description: "Give this view a short name." });
      return;
    }
    try {
      await apiSend("/saved-views", "POST", { page, name: trimmed, filters });
      setName("");
      toast({ kind: "success", title: "View saved", description: trimmed });
      refresh();
    } catch (reason) {
      toast({ kind: "error", title: "Could not save view", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  async function remove() {
    if (!selectedId) return;
    const view = views.find((item) => item.id === selectedId);
    if (!view) return;
    await apiSend(`/saved-views/${selectedId}`, "DELETE");
    setSelectedId("");
    setConfirmDeleteOpen(false);
    toast({ kind: "success", title: "View deleted" });
    refresh();
  }

  function apply(id: string) {
    setSelectedId(id);
    const view = views.find((item) => item.id === id);
    if (view) onApply(view.filters);
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-3 shadow-sm md:grid-cols-[1fr_auto_1fr_auto_auto] md:items-center">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bookmark className="h-4 w-4 text-primary" />
        Saved views
      </div>
      <Select value={selectedId} onChange={(event) => apply(event.target.value)}>
        <option value="">Choose view</option>
        {views.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
      </Select>
      <Input value={name} placeholder="Save current filters as..." onChange={(event) => setName(event.target.value)} />
      <Button type="button" onClick={save}>
        <Save className="h-4 w-4" />
        Save
      </Button>
      <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setConfirmDeleteOpen(true)} disabled={!selectedId} aria-label="Delete saved view">
        <Trash2 className="h-4 w-4" />
      </Button>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete saved view?"
        description={`Are you sure you want to delete ${views.find((item) => item.id === selectedId)?.name ?? "this saved view"}?`}
        confirmLabel="Delete view"
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={remove}
      />
    </div>
  );
}
