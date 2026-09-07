"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Truck, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
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

  const query = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const response = await supplierRequest("/api/suppliers");
      return (response?.data ?? []) as SupplierDto[];
    },
  });

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
      {banner ? <div role="status" className="border-primary/30 bg-primary/10 mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3"><p className="text-primary break-words text-sm">{banner}</p><Button variant="ghost" size="icon-sm" aria-label="Dismiss notification" onClick={() => setBanner(null)}><X aria-hidden /></Button></div> : null}
      {statusMutation.error ? <p role="alert" className="mb-4 text-sm text-destructive">{statusMutation.error.message}</p> : null}
      <Card><CardContent className="p-0">
        {query.isLoading ? <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading suppliers</div>
          : query.error ? <div className="p-8 text-center text-sm text-destructive">{query.error.message}</div>
          : query.data?.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground"><Truck className="h-8 w-8" /><p>No suppliers yet.</p></div>
          : <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Supplier</TableHead><TableHead>Contact Person</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{query.data?.map((supplier) => <TableRow key={supplier.id}><TableCell className="font-mono font-semibold">{supplier.code || "-"}</TableCell><TableCell className="font-medium">{supplier.name}</TableCell><TableCell>{supplier.contactPerson || "-"}</TableCell><TableCell>{supplier.contactNumber || supplier.email || "-"}</TableCell><TableCell><span className={supplier.status === "ACTIVE" ? "text-emerald-700" : "text-muted-foreground"}>{supplier.status === "ACTIVE" ? "Active" : "Inactive"}</span></TableCell><TableCell><div className="flex justify-end gap-2">{canUpdate ? <Button variant="edit" size="sm" onClick={() => openEdit(supplier)}><Pencil className="mr-2 h-4 w-4" />Edit</Button> : null}{canSetStatus ? <Button variant={supplier.status === "ACTIVE" ? "outline" : "workflow"} size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(supplier)}>{supplier.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</Button> : null}{!canUpdate && !canSetStatus ? <span className="text-muted-foreground">-</span> : null}</div></TableCell></TableRow>)}</TableBody></Table>}
      </CardContent></Card>

      {((editing && canUpdate) || (!editing && canCreate)) ? <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle><DialogDescription>{editing ? "Update supplier details without changing receipt history." : "Create an active supplier for stock receiving."}</DialogDescription></DialogHeader><div className="grid gap-4 py-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-code">Code</Label><Input id="supplier-code" value={form.code} maxLength={30} onChange={(event) => setField("code", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-name">Name</Label><Input id="supplier-name" value={form.name} required maxLength={200} onChange={(event) => setField("name", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-contact-person">Contact person</Label><Input id="supplier-contact-person" value={form.contactPerson} maxLength={120} onChange={(event) => setField("contactPerson", event.target.value)} /></div><div className="space-y-2"><Label htmlFor="supplier-contact-number">Contact number</Label><Input id="supplier-contact-number" value={form.contactNumber} maxLength={60} onChange={(event) => setField("contactNumber", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-email">Email</Label><Input id="supplier-email" type="email" value={form.email} maxLength={200} onChange={(event) => setField("email", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-address">Address</Label><Input id="supplier-address" value={form.address} maxLength={300} onChange={(event) => setField("address", event.target.value)} /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="supplier-notes">Notes</Label><Textarea id="supplier-notes" value={form.notes} maxLength={1000} onChange={(event) => setField("notes", event.target.value)} /></div></div>{formError ? <p role="alert" className="mb-4 text-sm text-destructive">{formError}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add supplier"}</Button></DialogFooter></form></DialogContent></Dialog> : null}
    </PageShell>
  );
}
