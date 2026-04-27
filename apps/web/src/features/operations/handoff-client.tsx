"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardPenLine, Loader2, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { humanize } from "@/lib/utils";
import { floridaRegions, type FloridaRegion, type HandoffNote, type HandoffNoteStatus, type HandoffNoteType } from "@/types/domain";

const noteTypes: HandoffNoteType[] = ["dispatch", "driver", "repair", "inventory", "admin"];
const priorities = ["low", "medium", "high", "urgent"] as const;

export function HandoffClient() {
  const [notes, setNotes] = useState<HandoffNote[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | HandoffNoteStatus>("open");
  const [typeFilter, setTypeFilter] = useState<"all" | HandoffNoteType>("all");
  const [regionFilter, setRegionFilter] = useState<"all" | FloridaRegion>("all");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(function refresh() {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("note_type", typeFilter);
    if (regionFilter !== "all") params.set("region", regionFilter);
    apiGet<HandoffNote[]>(`/handoff-notes?${params.toString()}`).then((items) => {
      setNotes(items);
      setError(null);
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : "Unable to load handoff notes.";
      setError(message.includes("handoff_notes") ? "Run migration 013_handoff_notes.sql to enable handoff notes." : message);
    }).finally(() => setIsLoading(false));
  }, [regionFilter, statusFilter, typeFilter]);

  useEffect(() => {
    // Handoff notes are fetched from the API whenever the queue filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const openCount = notes.filter((note) => note.status === "open").length;
  const urgentCount = notes.filter((note) => note.priority === "urgent" || note.priority === "high").length;
  const byType = useMemo(() => {
    return noteTypes.map((type) => ({ type, count: notes.filter((note) => note.note_type === type).length }));
  }, [notes]);

  return (
    <div className="space-y-5">
      <PageHeader title="Handoff" description="Shared shift notes for dispatch, drivers, repair, inventory, and admin context." />
      {error ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Open notes" value={openCount} />
        <MetricCard label="High / urgent" value={urgentCount} tone={urgentCount ? "warning" : "default"} />
        <MetricCard label="Visible notes" value={notes.length} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <HandoffForm onCreated={refresh} />
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><ClipboardPenLine className="h-4 w-4" /> Handoff Log</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Short operational notes that stay visible until resolved or archived.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | HandoffNoteStatus)}>
                  <option value="all">All status</option>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                </Select>
                <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | HandoffNoteType)}>
                  <option value="all">All types</option>
                  {noteTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
                </Select>
                <Select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value as "all" | FloridaRegion)}>
                  <option value="all">All regions</option>
                  {floridaRegions.map((region) => <option key={region} value={region}>{region}</option>)}
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {byType.map((item) => <Badge key={item.type} className="border-primary/25 bg-primary/10 text-primary">{humanize(item.type)} {item.count}</Badge>)}
            </div>
            {isLoading ? <ListSkeleton rows={6} /> : notes.length ? notes.map((note) => (
              <HandoffNoteRow key={note.id} note={note} onChanged={refresh} />
            )) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No handoff notes match these filters.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HandoffForm({ onCreated }: { onCreated: () => void }) {
  const [noteType, setNoteType] = useState<HandoffNoteType>("dispatch");
  const [priority, setPriority] = useState<(typeof priorities)[number]>("medium");
  const [region, setRegion] = useState<"" | FloridaRegion>("");
  const [title, setTitle] = useState("");
  const [contextLabel, setContextLabel] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  async function createNote() {
    if (title.trim().length < 2 || body.trim().length < 2) {
      toast({ kind: "error", title: "Title and note are required" });
      return;
    }
    setIsSaving(true);
    try {
      await apiSend<HandoffNote>("/handoff-notes", "POST", {
        note_type: noteType,
        priority,
        region: region || null,
        title: title.trim(),
        context_label: contextLabel.trim() || null,
        body: body.trim()
      });
      setTitle("");
      setContextLabel("");
      setBody("");
      toast({ kind: "success", title: "Handoff note posted" });
      onCreated();
    } catch (reason) {
      toast({ kind: "error", title: "Could not post note", description: reason instanceof Error ? reason.message : "Unable to create handoff note." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Handoff Note</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <Select value={noteType} onChange={(event) => setNoteType(event.target.value as HandoffNoteType)}>
            {noteTypes.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
          </Select>
          <Select value={priority} onChange={(event) => setPriority(event.target.value as (typeof priorities)[number])}>
            {priorities.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </div>
        <Select value={region} onChange={(event) => setRegion(event.target.value as "" | FloridaRegion)}>
          <option value="">No specific region</option>
          {floridaRegions.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        <Input value={title} placeholder="Short title" onChange={(event) => setTitle(event.target.value)} />
        <Input value={contextLabel} placeholder="Optional context, e.g. Driver Tampa, serial, patient" onChange={(event) => setContextLabel(event.target.value)} />
        <Textarea value={body} placeholder="What should the next person know?" onChange={(event) => setBody(event.target.value)} />
        <Button type="button" onClick={createNote} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Post handoff
        </Button>
      </CardContent>
    </Card>
  );
}

function HandoffNoteRow({ note, onChanged }: { note: HandoffNote; onChanged: () => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  async function setStatus(status: HandoffNoteStatus) {
    setIsSaving(true);
    try {
      await apiSend<HandoffNote>(`/handoff-notes/${note.id}`, "PATCH", { status });
      toast({ kind: "success", title: status === "resolved" ? "Note resolved" : "Note updated" });
      onChanged();
    } catch (reason) {
      toast({ kind: "error", title: "Could not update note", description: reason instanceof Error ? reason.message : "Unable to update handoff note." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={priorityClass(note.priority)}>{humanize(note.priority)}</Badge>
            <Badge>{humanize(note.note_type)}</Badge>
            <Badge className={note.status === "open" ? "border-primary/25 bg-primary/10 text-primary" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}>{humanize(note.status)}</Badge>
            {note.region ? <span className="text-xs font-medium text-muted-foreground">{note.region}</span> : null}
          </div>
          <div className="mt-2 font-semibold">{note.title}</div>
          {note.context_label ? <div className="mt-1 text-sm text-muted-foreground">{note.context_label}</div> : null}
          <p className="mt-2 whitespace-pre-line text-sm">{note.body}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>By {note.profiles?.full_name ?? "staff"}</span>
            <span>{new Date(note.created_at).toLocaleString()}</span>
            {note.equipment_id && note.equipment ? <Link className="text-primary hover:underline" href={`/equipment/${note.equipment_id}`}>{note.equipment.serial_number}</Link> : null}
            {note.patient_id && note.patients ? <Link className="text-primary hover:underline" href={`/patients/${note.patient_id}`}>{note.patients.full_name}</Link> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end">
          {note.status === "open" ? (
            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setStatus("resolved")} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Resolve
            </Button>
          ) : (
            <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setStatus("open")} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <Card className={tone === "warning" ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/35" : undefined}>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function priorityClass(priority: HandoffNote["priority"]) {
  if (priority === "urgent" || priority === "high") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  return "";
}
