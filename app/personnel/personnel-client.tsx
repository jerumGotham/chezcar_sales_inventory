"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contact, Loader2, Pencil, Plus, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
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
import type { PersonnelBranchOptionDto, PersonnelDto } from "@/lib/contracts/personnel";
import type { CapabilityId } from "@/lib/contracts/roles";

type PersonnelForm = {
  fullName: string;
  locationId: string;
  type: PersonnelDto["type"];
};

const TYPE_LABELS: Record<PersonnelDto["type"], string> = {
  SALESPERSON: "Salesperson",
  INSTALLER: "Installer",
  BOTH: "Salesperson & Installer",
};

function emptyForm(branches: readonly PersonnelBranchOptionDto[]): PersonnelForm {
  return { fullName: "", locationId: branches[0]?.id ?? "", type: "SALESPERSON" };
}

async function personnelRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as
    | { data?: PersonnelDto[] | PersonnelDto; error?: { message?: string } }
    | null;
  if (!response.ok) throw new Error(json?.error?.message ?? "Unable to save personnel");
  return json;
}

export function PersonnelClient({
  capabilities,
  branches,
}: {
  capabilities: ReadonlyArray<CapabilityId>;
  branches: readonly PersonnelBranchOptionDto[];
}) {
  const queryClient = useQueryClient();
  const canCreate = capabilities.includes("personnel:create");
  const canUpdate = capabilities.includes("personnel:update");
  const canSetStatus = capabilities.includes("personnel:deactivate");
  const [editing, setEditing] = useState<PersonnelDto | null>(null);
  const [deactivating, setDeactivating] = useState<PersonnelDto | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PersonnelForm>(() => emptyForm(branches));
  const [formError, setFormError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["personnel"],
    queryFn: async () => {
      const response = await personnelRequest("/api/personnel");
      return (response?.data ?? []) as PersonnelDto[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? personnelRequest(`/api/personnel/${editing.id}`, "PATCH", form)
      : personnelRequest("/api/personnel", "POST", form),
    onSuccess: async () => {
      const message = editing ? `${form.fullName.trim()} was updated.` : `${form.fullName.trim()} was created.`;
      await queryClient.invalidateQueries({ queryKey: ["personnel"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm(branches));
      setBanner(message);
    },
    onError: (error) => setFormError(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (personnel: PersonnelDto) => personnelRequest(
      `/api/personnel/${personnel.id}/status`,
      "POST",
      { status: personnel.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
    ),
    onSuccess: async (_, personnel) => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] });
      setBanner(`${personnel.fullName} was ${personnel.status === "ACTIVE" ? "deactivated" : "reactivated"}.`);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(branches));
    setFormError("");
    setOpen(true);
  }

  function openEdit(personnel: PersonnelDto) {
    setEditing(personnel);
    setForm({ fullName: personnel.fullName, locationId: personnel.locationId, type: personnel.type });
    setFormError("");
    setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    saveMutation.mutate();
  }

  return (
    <PageShell
      title="Personnel Maintenance"
      subtitle="Maintain non-login Salespersons and Installers within authorized branches."
      actions={canCreate ? <Button onClick={openCreate} disabled={branches.length === 0}><Plus className="mr-2 h-4 w-4" />Add personnel</Button> : undefined}
    >
      {banner ? (
        <div role="status" className="border-primary/30 bg-primary/10 mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3">
          <p className="text-primary break-words text-sm">{banner}</p>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss notification" onClick={() => setBanner(null)}><X aria-hidden /></Button>
        </div>
      ) : null}
      {statusMutation.error ? <p role="alert" className="mb-4 text-sm text-destructive">{statusMutation.error.message}</p> : null}
      {branches.length === 0 ? <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">No active authorized branch is available for Personnel Maintenance.</p> : null}
      <Card className="min-w-0"><CardContent className="p-0">
        {query.isLoading ? (
          <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading personnel</div>
        ) : query.error ? (
          <div className="p-8 text-center text-sm text-destructive">{query.error.message}</div>
        ) : query.data?.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-muted-foreground"><Contact className="h-8 w-8" /><p>No personnel yet.</p></div>
        ) : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Home Branch</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{query.data?.map((personnel) => (
            <TableRow key={personnel.id}><TableCell className="font-medium">{personnel.fullName}</TableCell><TableCell>{personnel.location.name} ({personnel.location.code})</TableCell><TableCell>{TYPE_LABELS[personnel.type]}</TableCell><TableCell><span className={personnel.status === "ACTIVE" ? "text-emerald-700" : "text-muted-foreground"}>{personnel.status === "ACTIVE" ? "Active" : "Inactive"}</span></TableCell><TableCell><div className="flex justify-end gap-2">{canUpdate ? <Button variant="edit" size="sm" onClick={() => openEdit(personnel)}><Pencil className="mr-2 h-4 w-4" />Edit</Button> : null}{canSetStatus ? <Button variant={personnel.status === "ACTIVE" ? "outline" : "workflow"} size="sm" disabled={statusMutation.isPending} onClick={() => personnel.status === "ACTIVE" ? setDeactivating(personnel) : statusMutation.mutate(personnel)}>{personnel.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</Button> : null}{!canUpdate && !canSetStatus ? <span className="text-muted-foreground">-</span> : null}</div></TableCell></TableRow>
          ))}</TableBody></Table></div>
        )}
      </CardContent></Card>

      <ConfirmationDialog
        open={deactivating !== null}
        title="Deactivate personnel?"
        description={`Deactivate ${deactivating?.fullName ?? "this personnel record"}? They will no longer be available for new Salesperson or Installer assignments. Historical records will be preserved.`}
        confirmLabel="Deactivate"
        onOpenChange={(isOpen) => { if (!isOpen) setDeactivating(null); }}
        onConfirm={() => {
          if (deactivating && canSetStatus && !statusMutation.isPending) statusMutation.mutate(deactivating);
        }}
      />

      {((editing && canUpdate) || (!editing && canCreate)) ? (
        <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><form onSubmit={submit}><DialogHeader><DialogTitle>{editing ? "Edit personnel" : "Add personnel"}</DialogTitle><DialogDescription>Personnel records identify Salespersons and Installers but do not create system accounts.</DialogDescription></DialogHeader><div className="grid gap-4 py-5"><div className="space-y-2"><Label htmlFor="personnel-name">Name</Label><Input id="personnel-name" value={form.fullName} required maxLength={200} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="personnel-branch">Home branch</Label><select id="personnel-branch" value={form.locationId} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} - {branch.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="personnel-type">Personnel type</Label><select id="personnel-type" value={form.type} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as PersonnelDto["type"] }))}><option value="SALESPERSON">Salesperson</option><option value="INSTALLER">Installer</option><option value="BOTH">Salesperson & Installer</option></select></div></div>{formError ? <p role="alert" className="mb-4 text-sm text-destructive">{formError}</p> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saveMutation.isPending || !form.locationId}>{saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? "Save changes" : "Add personnel"}</Button></DialogFooter></form></DialogContent></Dialog>
      ) : null}
    </PageShell>
  );
}
