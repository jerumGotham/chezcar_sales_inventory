"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TablePagination } from "@/components/table-pagination";
import { AUDIT_CATEGORIES, type AuditEntryDto, type AuditTrailDto } from "@/lib/contracts/audit";

const PAGE_SIZE = 25;

type Filters = { category: string; search: string; dateFrom: string; dateTo: string };

const EMPTY_FILTERS: Filters = { category: "all", search: "", dateFrom: "", dateTo: "" };

/**
 * Built once. toLocaleString with options constructs a formatter on every call,
 * which ran twenty-five times per render — including the render that opens the
 * details dialog, where it showed up as a hitch before the dialog appeared.
 */
const dateTime = new Intl.DateTimeFormat("en-PH", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatMoment(value: string) {
  return dateTime.format(new Date(value));
}

export function AuditClient() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [openEntry, setOpenEntry] = useState<AuditEntryDto | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (applied.category !== "all") search.set("category", applied.category);
    if (applied.search) search.set("search", applied.search);
    if (applied.dateFrom) search.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) search.set("dateTo", applied.dateTo);
    return search.toString();
  }, [applied, page]);

  const query = useQuery({
    queryKey: ["audit", params],
    queryFn: async () => {
      const response = await fetch(`/api/audit?${params}`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load the audit trail");
      return json.data as AuditTrailDto;
    },
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.data ?? [];
  // Stable, so the memoised rows survive opening and closing the dialog.
  const openDetails = useCallback((row: AuditEntryDto) => setOpenEntry(row), []);
  const meta = query.data?.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1, truncated: false };

  const apply = (next: Filters) => {
    setApplied(next);
    setDraft(next);
    setPage(1);
  };

  return (
    <PageShell
      title="Audit Trail"
      subtitle="Every recorded action across sales, orders, inventory, transfers, and returns."
    >
      <Card className="mb-4">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="audit-category">Module</Label>
            <select
              id="audit-category"
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            >
              <option value="all">All modules</option>
              {AUDIT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="audit-search">Search</Label>
            <Input
              id="audit-search"
              placeholder="User, reference, or detail"
              value={draft.search}
              onChange={(event) => setDraft({ ...draft, search: event.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => apply(draft)}>Apply Filters</Button>
            <Button variant="outline" onClick={() => apply(EMPTY_FILTERS)}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {query.error ? (
        <p role="alert" className="text-destructive mb-4 text-sm">{(query.error as Error).message}</p>
      ) : null}
      {meta.truncated ? (
        <p className="text-muted-foreground mb-4 text-sm">
          Showing the most recent entries only. Narrow the date range to see older records.
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-sm">
                {meta.total === 0 ? "No entries" : `${meta.total} entries`}
              </p>
              {query.isFetching ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : null}
            </div>
            <TablePagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} busy={query.isFetching} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                      {query.isLoading ? "Loading the audit trail…" : "No recorded activity for these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => <AuditRow key={row.id} row={row} onView={openDetails} />)
                )}
              </TableBody>
            </Table>
          </div>

        </CardContent>
      </Card>
      <AuditEntryDialog entry={openEntry} onClose={() => setOpenEntry(null)} />
    </PageShell>
  );
}

/**
 * Memoised because opening the dialog re-renders this component, and without it
 * every row in the page rebuilt just to show one entry's details.
 */
const AuditRow = memo(function AuditRow({ row, onView }: { row: AuditEntryDto; onView: (row: AuditEntryDto) => void }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatMoment(row.occurredAt)}</TableCell>
      <TableCell><Badge variant="outline">{row.category}</Badge></TableCell>
      <TableCell className="font-medium">{row.action}</TableCell>
      <TableCell>{row.actor}</TableCell>
      <TableCell className="font-mono text-xs">{row.reference}</TableCell>
      <TableCell>{row.location}</TableCell>
      <TableCell className="max-w-md">{row.details}</TableCell>
      <TableCell className="text-right">
        <Button variant="view" size="sm" onClick={() => onView(row)}>View</Button>
      </TableCell>
    </TableRow>
  );
});

function FactList({ facts }: { facts: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {facts.map((fact, index) => (
        <div key={`${fact.label}-${index}`}>
          <dt className="text-muted-foreground text-xs uppercase tracking-wide">{fact.label}</dt>
          {/* A blank value used to render an empty line that read as a bug. */}
          <dd className="text-sm break-words">{fact.value?.trim() ? fact.value : <span className="text-muted-foreground">Not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The entry-specific facts used to sit in one flat grid with When, Module and
 * User, so the thing that actually happened was mixed in with the row's own
 * column values. Context, the sentence, what changed, and the items are now
 * four separate blocks.
 */
function AuditEntryDialog({ entry, onClose }: { entry: AuditEntryDto | null; onClose: () => void }) {
  const context = entry
    ? [
        { label: "User", value: entry.actor },
        { label: "Reference", value: entry.reference },
        { label: "Branch", value: entry.location },
      ]
    : [];
  const changes = entry?.facts ?? [];

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry?.action ?? "Entry"}</DialogTitle>
          <DialogDescription>
            {entry ? `${entry.category} · ${formatMoment(entry.occurredAt)}` : null}
          </DialogDescription>
        </DialogHeader>
        {entry ? (
          <div className="space-y-5">
            {entry.details?.trim() ? (
              <p className="bg-muted rounded-md p-3 text-sm">{entry.details}</p>
            ) : null}

            <FactList facts={context} />

            {changes.length ? (
              <section>
                <h3 className="mb-2 text-sm font-medium">What changed</h3>
                <FactList facts={changes} />
              </section>
            ) : null}

            {entry.items?.length ? (
              <section>
                <h3 className="mb-2 text-sm font-medium">
                  Items <span className="text-muted-foreground font-normal">({entry.items.length})</span>
                </h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.items.map((item, index) => (
                        <TableRow key={`${item.name}-${index}`}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity ?? "-"}</TableCell>
                          <TableCell className="text-right">{item.amount ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
