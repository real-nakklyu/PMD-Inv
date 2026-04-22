"use client";

import { Loader2, Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SearchPickerOption = {
  id: string;
  label: string;
  description?: string;
};

export function AsyncSearchPicker({
  label,
  placeholder,
  value,
  onChange,
  loadOptions,
  disabled
}: {
  label: string;
  placeholder: string;
  value: SearchPickerOption | null;
  onChange: (option: SearchPickerOption | null) => void;
  loadOptions: (query: string) => Promise<SearchPickerOption[]>;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchPickerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await loadOptions(query);
        if (active) setOptions(results);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Search failed.");
      } finally {
        if (active) setIsLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [loadOptions, query]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-ring/40 bg-primary/5 px-3 py-2 shadow-sm">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{value.label}</div>
            {value.description ? <div className="truncate text-xs text-muted-foreground">{value.description}</div> : null}
          </div>
          <Button
            type="button"
            className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80"
            aria-label={`Clear ${label}`}
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={id}
              className="pl-9"
              value={query}
              placeholder={placeholder}
              onChange={(event) => setQuery(event.target.value)}
              disabled={disabled}
            />
            {isLoading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-border bg-card shadow-sm">
            {options.length ? options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full border-b border-border px-3 py-2.5 text-left transition hover:bg-secondary active:bg-sidebar-accent last:border-0"
                onClick={() => onChange(option)}
                disabled={disabled}
              >
                <div className="truncate text-sm font-medium">{option.label}</div>
                {option.description ? <div className="truncate text-xs text-muted-foreground">{option.description}</div> : null}
              </button>
            )) : (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                {isLoading ? "Searching..." : "No matches. Try a name, serial, make, model, or region."}
              </div>
            )}
          </div>
          {error ? <p className="text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
        </>
      )}
    </div>
  );
}
