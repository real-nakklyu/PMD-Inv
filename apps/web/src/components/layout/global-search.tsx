"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { cn, humanize } from "@/lib/utils";
import type { GlobalSearchResponse, GlobalSearchResult } from "@/types/domain";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = document.activeElement?.tagName;
      if (event.key === "/" && target !== "INPUT" && target !== "TEXTAREA") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className="hidden h-10 min-w-[240px] items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-muted-foreground shadow-sm transition hover:border-primary/45 hover:bg-background active:translate-y-px md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate">Search serial, patient, ticket...</span>
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">/</span>
      </button>
      <Button type="button" className="h-10 w-10 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80 md:hidden" onClick={() => setOpen(true)} aria-label="Open search">
        <Search className="h-5 w-5" />
      </Button>
      <SearchDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmed = query.trim();

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setError(null);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      apiGet<GlobalSearchResponse>(`/search?q=${encodeURIComponent(trimmed)}&limit=30`)
        .then((data) => {
          if (!controller.signal.aborted) {
            setResults(data.results);
            setError(null);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setError(reason instanceof Error ? reason.message : "Search failed.");
            setResults([]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, trimmed]);

  const grouped = useMemo(() => {
    return results.reduce<Record<string, GlobalSearchResult[]>>((groups, item) => {
      groups[item.kind] = groups[item.kind] ?? [];
      groups[item.kind].push(item);
      return groups;
    }, {});
  }, [results]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-sm" aria-label="Close search" onClick={onClose} />
      <div className="absolute left-1/2 top-6 flex max-h-[calc(100vh-3rem)] w-[min(760px,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-slate-950/30">
        <div className="flex items-center gap-3 border-b border-border p-3">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search serial, patient, service ticket, return, assignment..."
            className="border-0 bg-transparent shadow-none focus:ring-0"
          />
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close search">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          <h2 id="global-search-title" className="sr-only">Global operations search</h2>
          {trimmed.length < 2 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search live operations records.
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</div>
          ) : isLoading ? (
            <ListSkeleton rows={5} />
          ) : results.length ? (
            <div className="space-y-4">
              {Object.entries(grouped).map(([kind, items]) => (
                <div key={kind}>
                  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{humanize(kind)}</div>
                  <div className="grid gap-2">
                    {items.map((item) => <SearchResultRow key={item.id} item={item} onClose={onClose} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No matching records found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchResultRow({ item, onClose }: { item: GlobalSearchResult; onClose: () => void }) {
  return (
    <Link href={item.href} onClick={onClose} className="block rounded-md border border-border bg-background p-3 transition hover:border-primary/45 hover:bg-primary/5 active:translate-y-px">
      <span className="flex flex-wrap items-center gap-2">
        <Badge className={cn("w-fit", statusTone(String(item.metadata.status ?? "")))}>{humanize(item.kind)}</Badge>
        {typeof item.metadata.region === "string" ? <span className="text-xs font-medium text-muted-foreground">{item.metadata.region}</span> : null}
      </span>
      <span className="mt-2 block font-semibold">{item.title}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{item.subtitle}</span>
    </Link>
  );
}

function statusTone(status: string) {
  if (["urgent", "critical", "in_repair", "waiting_parts"].includes(status)) return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";
  if (["available", "resolved", "closed"].includes(status)) return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return "";
}
