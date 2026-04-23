"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Download, ExternalLink, MapPin, Package, Trash2 } from "lucide-react";

import { SavedViewsControl } from "@/components/operations/saved-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input, Select } from "@/components/ui/input";
import { ListSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiGet, apiSend } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { currency, humanize } from "@/lib/utils";
import { equipmentStatuses, equipmentTypes, floridaRegions, type Equipment, type EquipmentPage } from "@/types/domain";

const column = createColumnHelper<Equipment>();
const pageSize = 25;

export function InventoryTable() {
  const [data, setData] = useState<Equipment[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const deferredSearch = useDeferredValue(globalFilter);
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [pageIndex, setPageIndex] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Equipment | null>(null);
  const { toast } = useToast();

  const refresh = useCallback(() => {
    setIsLoading(true);
    apiGet<EquipmentPage>(`/equipment/page?${buildInventoryParams({ search: deferredSearch, region, status, type, offset: pageIndex * pageSize, limit: pageSize })}`).then((page) => {
      setData(page.items);
      setTotalRecords(page.total);
      setError(null);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load inventory.");
    }).finally(() => setIsLoading(false));
  }, [deferredSearch, pageIndex, region, status, type]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function deleteEquipment(item: Equipment) {
    try {
      const result = await apiSend<{ action: "deleted" | "archived"; message: string }>(`/equipment/${item.id}`, "DELETE");
      toast({
        kind: "success",
        title: result.action === "archived" ? "Equipment retired" : "Equipment deleted",
        description: result.action === "archived" ? `${item.serial_number} was archived because it has history.` : item.serial_number
      });
      setPendingDelete(null);
      refresh();
    } catch (reason) {
      const description = reason instanceof Error ? reason.message : "Unable to delete equipment.";
      setError(description);
      toast({ kind: "error", title: "Could not delete equipment", description });
    }
  }

  const columns = useMemo(
    () => [
      column.accessor("serial_number", {
        header: "Serial",
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>
      }),
      column.accessor("equipment_type", {
        header: "Type",
        cell: (info) => humanize(info.getValue())
      }),
      column.accessor((row) => `${row.make} ${row.model}`, {
        id: "equipment",
        header: "Equipment"
      }),
      column.accessor("region", { header: "Region" }),
      column.accessor("status", {
        header: "Status",
        cell: (info) => <Badge>{info.getValue()}</Badge>
      }),
      column.accessor("bought_price", {
        header: "Cost",
        cell: (info) => currency(info.getValue())
      }),
      column.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary" href={`/equipment/${row.original.id}`}>
              Open <ExternalLink className="h-3 w-3" />
            </Link>
            <Button type="button" className="h-8 w-8 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete equipment" onClick={() => setPendingDelete(row.original)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })
    ],
    []
  );

  // TanStack Table intentionally returns function-heavy objects that React Compiler cannot memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  async function exportInventory() {
    try {
      const exportParams = buildInventoryParams({ search: deferredSearch, region, status, type, offset: 0, limit: 1000 });
      const items = await apiGet<Equipment[]>(`/equipment?${exportParams}`);
      downloadCsv(
        `pmdinv-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        items.map((item) => ({
          serial_number: item.serial_number,
          equipment_type: humanize(item.equipment_type),
          make: item.make,
          model: item.model,
          status: humanize(item.status),
          region: item.region,
          bought_price: item.bought_price,
          added_at: item.added_at,
          assigned_at: item.assigned_at ?? "",
          notes: item.notes ?? ""
        }))
      );
      toast({ kind: "success", title: "Inventory CSV downloaded", description: `${items.length} records exported.` });
    } catch (reason) {
      toast({ kind: "error", title: "Could not export inventory", description: reason instanceof Error ? reason.message : "Please try again." });
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const canGoPrevious = pageIndex > 0;
  const canGoNext = pageIndex + 1 < totalPages;

  return (
    <Card>
      <CardContent>
        <div className="mb-3">
          <SavedViewsControl
            page="inventory"
            filters={{ search: globalFilter, region, status, type }}
            onApply={(filters) => {
              setGlobalFilter(typeof filters.search === "string" ? filters.search : "");
              setRegion(typeof filters.region === "string" ? filters.region : "all");
              setStatus(typeof filters.status === "string" ? filters.status : "all");
              setType(typeof filters.type === "string" ? filters.type : "all");
              setPageIndex(0);
            }}
          />
        </div>
        <div className="mb-5 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-[1fr_160px_160px_160px_auto]">
          <Input value={globalFilter} placeholder="Search serial, make, model" onChange={(event) => {
            setGlobalFilter(event.target.value);
            setPageIndex(0);
          }} />
          <Select value={region} onChange={(event) => {
            setRegion(event.target.value);
            setPageIndex(0);
          }}>
            <option value="all">All regions</option>
            {floridaRegions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => {
            setStatus(event.target.value);
            setPageIndex(0);
          }}>
            <option value="all">All statuses</option>
            {equipmentStatuses.map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </Select>
          <Select value={type} onChange={(event) => {
            setType(event.target.value);
            setPageIndex(0);
          }}>
            <option value="all">All types</option>
            {equipmentTypes.map((item) => (
              <option key={item} value={item}>
                {humanize(item)}
              </option>
            ))}
          </Select>
          <Button type="button" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80 md:w-auto" onClick={exportInventory}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>

        {error ? <LoadError message={error} /> : null}

        <div className="space-y-3 md:hidden">
          {isLoading ? <ListSkeleton rows={4} /> : table.getRowModel().rows.map((row) => (
            <MobileInventoryCard key={row.original.id} item={row.original} onDelete={() => setPendingDelete(row.original)} />
          ))}
          {!isLoading && !table.getRowModel().rows.length ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No inventory records found.
            </div>
          ) : null}
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-border md:block">
          {isLoading ? <TableSkeleton rows={6} columns={6} /> : <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-muted/65">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border bg-card transition-colors last:border-0 hover:bg-muted/55">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {!table.getRowModel().rows.length ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={columns.length}>
                      No inventory records found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md bg-muted/35 px-3 py-2">
          <div className="text-xs font-medium text-muted-foreground">
            {totalRecords} records
            <span className="ml-2 text-muted-foreground/75">Page {pageIndex + 1} of {totalPages}</span>
          </div>
          <div className="flex gap-2">
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setPageIndex((value) => Math.max(0, value - 1))} disabled={!canGoPrevious || isLoading}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setPageIndex((value) => value + 1)} disabled={!canGoNext || isLoading}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={Boolean(pendingDelete)}
          title="Delete or retire equipment?"
          description={`Are you sure you want to remove ${pendingDelete?.serial_number ?? "this equipment"}? If it has assignment, return, service, or label history, it will be retired and archived so the audit trail stays intact.`}
          confirmLabel="Remove equipment"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => pendingDelete ? deleteEquipment(pendingDelete) : undefined}
        />
      </CardContent>
    </Card>
  );
}

function buildInventoryParams({
  search,
  region,
  status,
  type,
  offset,
  limit
}: {
  search: string;
  region: string;
  status: string;
  type: string;
  offset: number;
  limit: number;
}) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.set("search", trimmedSearch);
  if (region !== "all") params.set("region", region);
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("equipment_type", type);
  return params.toString();
}

function MobileInventoryCard({ item, onDelete }: { item: Equipment; onDelete: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-primary">{item.serial_number}</div>
          <div className="mt-1 truncate text-base font-semibold">{item.make} {item.model}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {humanize(item.equipment_type)}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.region}</span>
          </div>
        </div>
        <Badge>{item.status}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/35 p-3 text-sm">
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">Cost</div>
          <div className="mt-0.5 font-semibold">{currency(item.bought_price)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-muted-foreground">Added</div>
          <div className="mt-0.5 font-semibold">{new Date(item.added_at).toLocaleDateString()}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Link
          href={`/equipment/${item.id}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 active:translate-y-px active:scale-[0.98]"
        >
          Open
          <ExternalLink className="h-4 w-4" />
        </Link>
        <Button type="button" className="h-10 w-10 bg-secondary p-0 text-secondary-foreground hover:bg-secondary/80" aria-label="Delete equipment" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      Live inventory could not be loaded. {message}
    </div>
  );
}
