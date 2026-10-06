"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Truck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { SortableHeader, useTableSort } from "@/components/sortable-header";
import { StatusBanner } from "@/components/status-banner";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import type { CapabilityId } from "@/lib/contracts/roles";
import type { SupplierDto } from "@/lib/contracts/suppliers";

type SupplierForm = {
  code: string;
  name: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: SupplierForm = {
  code: "",
  name: "",
  contactPerson: "",
  contactNumber: "",
  email: "",
  address: "",
  notes: "",
};

async function supplierRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as
    | { data?: SupplierDto[] | SupplierDto; error?: { message?: string } }
    | null;
  if (!response.ok) throw new Error(json?.error?.message ?? "Unable to save supplier");
  return json;
}

function formFor(supplier: SupplierDto): SupplierForm {
  return {
    code: supplier.code ?? "",
    name: supplier.name,
    contactPerson: supplier.contactPerson ?? "",
    contactNumber: supplier.contactNumber ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    notes: supplier.notes ?? "",
  };
}

export function SuppliersClient({ capabilities }: { capabilities: ReadonlyArray<CapabilityId> }) {
  const queryClient = useQueryClient();
  const canCreate = capabilities.includes("suppliers:create");
  const canUpdate = capabilities.includes("suppliers:update");
  const canSetStatus = capabilities.includes("suppliers:deactivate");
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  /*
   * Typing is held separately from what the list is reading. A keystroke per
   * request would refetch eighty suppliers on the way to the one being looked
   * for; Apply says when the reader has finished the thought.
   */
  const [draft, setDraft] = useState({ search: "", status: "all" });
  const [applied, setApplied] = useState({ search: "", status: "all" });
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["suppliers", applied.search, applied.status, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10",
        status: applied.status,
      });
      if (applied.search) params.set("search", applied.search);
      const response = await supplierRequest(`/api/suppliers?${params.toString()}`);
      return response as { data: SupplierDto[]; meta: { page: number; totalPages: number; total: number } };
    },
    placeholderData: (previous) => previous,
  });
  const rows = query.data?.data ?? [];
  const { rows: sortedRows, sort, toggle } = useTableSort(rows, {
    code: (supplier) => supplier.code,
    name: (supplier) => supplier.name,
    contactPerson: (supplier) => supplier.contactPerson,
    contact: (supplier) => supplier.contactNumber || supplier.email,
    status: (supplier) => supplier.status,
  });
  const meta = query.data?.meta ?? { page: 1, totalPages: 1, total: 0 };

  const applyFilters = () => {
    setApplied(draft);
    // A new filter starts at its own first page, never the old page number.
    setPage(1);
  };

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? supplierRequest(`/api/suppliers/${editing.id}`, "PATCH", form)
      : supplierRequest("/api/suppliers", "POST", form),
    onSuccess: async () => {
      const message = editing ? `${form.name.trim()} was updated.` : `${form.name.trim()} was created.`;
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setBanner(message);
    },
    onError: (error) => setFormError(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (supplier: SupplierDto) => supplierRequest(
      `/api/suppliers/${supplier.id}/status`,
      "POST",
      { status: supplier.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
    ),
    onSuccess: async (_, supplier) => {
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setBanner(`${supplier.name} was ${supplier.status === "ACTIVE" ? "deactivated" : "reactivated"}.`);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setOpen(true);
  }

  function openEdit(supplier: SupplierDto) {
    setEditing(supplier);
    setForm(formFor(supplier));
    setFormError("");
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    saveMutation.mutate();
  }

  const setField = (field: keyof SupplierForm, value: string) =>
    setForm((current) => ({ ...current, [field]: field === "code" ? value.toUpperCase() : value }));

  return (
    <PageShell
      title="Supplier Maintenance"
      subtitle="Maintain suppliers used by stock receiving and future supplier claims."
      actions={canCreate ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add supplier</Button> : undefined}
    >
      {banner ? <StatusBanner tone="success" className="mb-4" onDismiss={() => setBanner(null)}>{banner}</StatusBanner> : null}
      {statusMutation.error ? <StatusBanner tone="error" className="mb-4">{statusMutation.error.message}</StatusBanner> : null}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="supplier-search">
            Search
          </label>
          <Input
            id="supplier-search"
            value={draft.search}
            placeholder="Code, name or contact person"
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Enter") applyFilters(); }}
          />
        </div>
        <div className="w-44 space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="supplier-status">
            Status
          </label>
          <select
            id="supplier-status"
            value={draft.status}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button onClick={applyFilters}>Apply filters</Button>
        <Button
          variant="outline"
          onClick={() => {
            setDraft({ search: "", status: "all" });
            setApplied({ search: "", status: "all" });
            setPage(1);
          }}
        >
          Reset
        </Button>
      </div>

      <Card><CardContent className="p-0">
        {query.isLoading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading suppliers</div>
          : query.error ? <div className="p-8 text-center text-sm text-destructive">{query.error.message}</div>
          : rows.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground"><Truck className="h-8 w-8" /><p>No suppliers yet.</p></div>
          : <Table><TableHeader><TableRow><SortableHeader label="Code" sortKey="code" sort={sort} onSort={toggle} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" /><SortableHeader label="Supplier" sortKey="name" sort={sort} onSort={toggle} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" /><SortableHeader label="Contact Person" sortKey="contactPerson" sort={sort} onSort={toggle} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" /><SortableHeader label="Contact" sortKey="contact" sort={sort} onSort={toggle} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" /><SortableHeader label="Status" sortKey="status" sort={sort} onSort={toggle} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground" /><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{sortedRows.map((supplier) => <TableRow key={supplier.id}><TableCell className="font-mono font-semibold">{supplier.code || "-"}</TableCell><TableCell className="font-medium">{supplier.name}</TableCell><TableCell>{supplier.contactPerson || "-"}</TableCell><TableCell>{supplier.contactNumber || supplier.email || "-"}</TableCell><TableCell><span className={supplier.status === "ACTIVE" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>{supplier.status === "ACTIVE" ? "Active" : "Inactive"}</span></TableCell><TableCell><div className="flex justify-end gap-2">{canUpdate ? <Button variant="edit" size="sm" onClick={() => openEdit(supplier)}><Pencil className="mr-2 h-4 w-4" />Edit</Button> : null}{canSetStatus ? <Button variant={supplier.status === "ACTIVE" ? "outline" : "workflow"} size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(supplier)}>{supplier.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</Button> : null}{!canUpdate && !canSetStatus ? <span className="text-muted-foreground">-</span> : null}</div></TableCell></TableRow>)}</TableBody></Table>}
        {rows.length > 0 ? (
          <div className="flex justify-end border-t px-5 py-3">
            <TablePagination
              page={meta.page}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              busy={query.isFetching}
            />
          </div>
        ) : null}
      </CardContent></Card>

      {((editing && canUpdate) || (!editing && canCreate)) ? <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle><DialogDescription>{editing ? "Update supplier details without changing receipt history." : "Create an active supplier for stock receiving."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-code">Code</Label><Input id="supplier-code" value={form.code} maxLength={30} onChange={(event) => setField("code", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-name">Name</Label><Input id="supplier-name" value={form.name} required maxLength={200} onChange={(event) => setField("name", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-contact-person">Contact person</Label><Input id="supplier-contact-person" value={form.contactPerson} maxLength={120} onChange={(event) => setField("contactPerson", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-contact-number">Contact number</Label><Input id="supplier-contact-number" value={form.contactNumber} maxLength={60} onChange={(event) => setField("contactNumber", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-email">Email</Label><Input id="supplier-email" type="email" value={form.email} maxLength={200} onChange={(event) => setField("email", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-address">Address</Label><Input id="supplier-address" value={form.address} maxLength={300} onChange={(event) => setField("address", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-notes">Notes</Label><Textarea id="supplier-notes" value={form.notes} maxLength={1000} onChange={(event) => setField("notes", event.target.value)} /></div></div>{formError ? <StatusBanner tone="error" className="mb-4">{formError}</StatusBanner> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add supplier"}</Button></DialogFooter></form></DialogContent></Dialog> : null}
    </PageShell>
  );
}
