"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil, Plus, X } from "lucide-react";

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
import type { BranchDto } from "@/lib/contracts/branches";
import type { CapabilityId } from "@/lib/contracts/roles";

type BranchForm = {
  code: string;
  name: string;
  address: string;
  city: string;
  contactNumber: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: BranchForm = {
  code: "",
  name: "",
  address: "",
  city: "",
  contactNumber: "",
  email: "",
  notes: "",
};

async function branchRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as
    | { data?: BranchDto[] | BranchDto; error?: { message?: string } }
    | null;
  if (!response.ok) throw new Error(json?.error?.message ?? "Unable to save branch");
  return json;
}

function formFor(branch: BranchDto): BranchForm {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address ?? "",
    city: branch.city ?? "",
    contactNumber: branch.contactNumber ?? "",
    email: branch.email ?? "",
    notes: branch.notes ?? "",
  };
}

export function BranchesClient({
  capabilities,
}: {
  capabilities: ReadonlyArray<CapabilityId>;
}) {
  const queryClient = useQueryClient();
  const canCreate = capabilities.includes("branches:create");
  const canUpdate = capabilities.includes("branches:update");
  const [editing, setEditing] = useState<BranchDto | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const response = await branchRequest("/api/branches");
      return (response?.data ?? []) as BranchDto[];
    },
  });

  const mutation = useMutation({
    mutationFn: () => {
      const { code, ...editable } = form;
      return editing
        ? branchRequest(`/api/branches/${editing.id}`, "PATCH", editable)
        : branchRequest("/api/branches", "POST", { ...editable, code });
    },
    onSuccess: async () => {
      const message = editing
        ? `${form.name.trim()} was updated.`
        : `${form.name.trim()} was created.`;
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setBanner(message);
    },
    onError: (error) => setFormError(error.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setOpen(true);
  }

  function openEdit(branch: BranchDto) {
    setEditing(branch);
    setForm(formFor(branch));
    setFormError("");
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    mutation.mutate();
  }

  const setField = (field: keyof BranchForm, value: string) =>
    setForm((current) => ({
      ...current,
      [field]: field === "code" ? value.toUpperCase() : value,
    }));

  return (
    <PageShell
      title="Branch Maintenance"
      subtitle="Add and maintain active sales branches. Branch codes are permanent."
      actions={canCreate ? <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Add branch</Button> : undefined}
    >
      {banner ? (
        <div
          role="status"
          className="border-primary/30 bg-primary/10 mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
        >
          <p className="text-primary break-words text-sm">{banner}</p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss notification"
            onClick={() => setBanner(null)}
          >
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading branches</div>
          ) : query.error ? (
            <div className="p-8 text-center text-sm text-destructive">{query.error.message}</div>
          ) : query.data?.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground"><Building2 className="h-8 w-8" /><p>No active branches yet.</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Branch</TableHead><TableHead>Location</TableHead><TableHead>Contact</TableHead><TableHead className="w-24 text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {query.data?.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-mono font-semibold">{branch.code}</TableCell>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{[branch.address, branch.city].filter(Boolean).join(", ") || "-"}</TableCell>
                    <TableCell>{branch.contactNumber || branch.email || "-"}</TableCell>
                    <TableCell className="text-right">{canUpdate ? <Button variant="edit" size="sm" onClick={() => openEdit(branch)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {((editing && canUpdate) || (!editing && canCreate)) && <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
              <DialogDescription>{editing ? "Update branch details. The code cannot be changed." : "Create an active branch available throughout sales and inventory."}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="branch-code">Code</Label><Input id="branch-code" value={form.code} disabled={Boolean(editing)} required minLength={2} maxLength={12} onChange={(event) => setField("code", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="branch-name">Name</Label><Input id="branch-name" value={form.name} required maxLength={120} onChange={(event) => setField("name", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="branch-address">Address</Label><Input id="branch-address" value={form.address} maxLength={300} onChange={(event) => setField("address", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="branch-city">City</Label><Input id="branch-city" value={form.city} maxLength={120} onChange={(event) => setField("city", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="branch-contact">Contact number</Label><Input id="branch-contact" value={form.contactNumber} maxLength={60} onChange={(event) => setField("contactNumber", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="branch-email">Email</Label><Input id="branch-email" type="email" value={form.email} maxLength={200} onChange={(event) => setField("email", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="branch-notes">Notes</Label><Textarea id="branch-notes" value={form.notes} maxLength={500} onChange={(event) => setField("notes", event.target.value)} /></div>
            </div>
            {formError ? <p role="alert" className="mb-4 text-sm text-destructive">{formError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add branch"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>}
    </PageShell>
  );
}
