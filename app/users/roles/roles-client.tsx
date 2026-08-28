"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSIGNABLE_ROLE_SCOPES,
  ASSIGNABLE_CAPABILITY_CATALOG,
  createRole,
  listRoles,
  updateRole,
  type AssignableRoleScope,
  type CapabilityId,
  type RoleDefinitionDto,
} from "@/lib/contracts/roles";

const SCOPE_LABELS = {
  OWNER: "Owner",
  BRANCH: "Branch",
  STOCK_ROOM: "Stock Room",
  BUSINESS_WIDE: "Business-wide",
} as const;

const CAPABILITY_GROUPS = Array.from(
  ASSIGNABLE_CAPABILITY_CATALOG.reduce((groups, capability) => {
    const items = groups.get(capability.module) ?? [];
    items.push(capability);
    groups.set(capability.module, items);
    return groups;
  }, new Map<string, Array<(typeof ASSIGNABLE_CAPABILITY_CATALOG)[number]>>()),
);

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; role: RoleDefinitionDto }
  | null;

function RoleEditor({
  state,
  onClose,
  onSaved,
}: {
  state: Exclude<EditorState, null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const existing = state.mode === "edit" ? state.role : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [scope, setScope] = useState<AssignableRoleScope>(
    existing && existing.scope !== "OWNER" ? existing.scope : "BRANCH",
  );
  const [permissions, setPermissions] = useState<CapabilityId[]>(
    existing?.permissions ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const scopeLocked = Boolean(existing?.assignedUserCount);

  const mutation = useMutation({
    mutationFn: () =>
      existing
        ? updateRole(existing.id, {
            name,
            description,
            scope,
            permissions,
            version: existing.version,
          })
        : createRole({ name, description, scope, permissions }),
    onSuccess: (role) =>
      onSaved(existing ? `${role.name} was updated.` : `${role.name} was created.`),
    onError: (requestError) => setError(requestError.message),
  });

  function togglePermission(permission: CapabilityId) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Role" : "Create Role"}</DialogTitle>
          <DialogDescription>
            Assign only the capabilities this role needs. Changes to permissions sign out assigned users.
          </DialogDescription>
        </DialogHeader>
        <form
          id="role-editor-form"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1"
          onSubmit={submit}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name</Label>
              <Input
                id="role-name"
                value={name}
                maxLength={120}
                required
                disabled={mutation.isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-scope">Operational Scope</Label>
              <Select<AssignableRoleScope>
                items={ASSIGNABLE_ROLE_SCOPES.map((value) => ({ value, label: SCOPE_LABELS[value] }))}
                value={scope}
                onValueChange={(value) => value && setScope(value)}
                disabled={scopeLocked || mutation.isPending}
              >
                <SelectTrigger id="role-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLE_SCOPES.map((value) => (
                    <SelectItem key={value} value={value}>{SCOPE_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scopeLocked && (
                <p className="text-muted-foreground text-xs">
                  Scope cannot change while {existing?.assignedUserCount} user(s) are assigned.
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Input
              id="role-description"
              value={description}
              maxLength={500}
              disabled={mutation.isPending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Permissions</h3>
                <p className="text-muted-foreground text-sm">{permissions.length} selected</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() =>
                  setPermissions(
                    permissions.length === ASSIGNABLE_CAPABILITY_CATALOG.length
                      ? []
                      : ASSIGNABLE_CAPABILITY_CATALOG.map((capability) => capability.id),
                  )
                }
              >
                {permissions.length === ASSIGNABLE_CAPABILITY_CATALOG.length ? "Clear All" : "Select All"}
              </Button>
            </div>
            {CAPABILITY_GROUPS.map(([module, capabilities]) => (
              <fieldset key={module} className="rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold">{module}</legend>
                <div className="grid gap-3 pt-2 md:grid-cols-2">
                  {capabilities.map((capability) => (
                    <label key={capability.id} className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={permissions.includes(capability.id)}
                        disabled={mutation.isPending}
                        onCheckedChange={() => togglePermission(capability.id)}
                      />
                      {capability.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="role-editor-form"
            disabled={mutation.isPending || !name.trim()}
          >
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {existing ? "Save Changes" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RolesClient() {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["roles"], queryFn: listRoles });

  async function handleSaved(message: string) {
    await queryClient.invalidateQueries({ queryKey: ["roles"] });
    setEditor(null);
    setBanner(message);
  }

  return (
    <>
      <PageShell
        title="Role Maintenance"
        subtitle="Create and edit persisted access roles and capability grants."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/users" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft className="mr-2 size-4" /> Back to Users
            </Link>
            <Button onClick={() => setEditor({ mode: "create" })}>Create Role</Button>
          </div>
        }
      >
        {banner && <div role="status" className="border-primary/30 bg-primary/10 mb-4 rounded-xl border px-4 py-3 text-sm">{banner}</div>}
        <Card>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading roles...
              </div>
            ) : query.isError ? (
              <div className="py-16 text-center">
                <p role="alert" className="text-destructive text-sm">We could not load roles.</p>
                <Button className="mt-3" variant="outline" onClick={() => void query.refetch()}>Try Again</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-muted/50 border-b text-left text-xs uppercase">
                    <tr>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Scope</th>
                      <th className="px-5 py-3">Assigned</th>
                      <th className="px-5 py-3">Permissions</th>
                      <th className="px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data?.map((role) => (
                      <tr key={role.id} className="border-b last:border-b-0">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 font-medium">
                            {role.isOwner && <ShieldCheck className="text-primary size-4" />}
                            {role.name}
                            {role.isSystem && <Badge variant="secondary">Built-in</Badge>}
                          </div>
                          <p className="text-muted-foreground mt-1 max-w-md text-sm">{role.description || "No description"}</p>
                        </td>
                        <td className="px-5 py-4 text-sm">{SCOPE_LABELS[role.scope]}</td>
                        <td className="px-5 py-4 text-sm">{role.assignedUserCount}</td>
                        <td className="px-5 py-4 text-sm">{role.permissions.length}</td>
                        <td className="px-5 py-4">
                          {role.isOwner ? (
                            <Badge variant="outline">Immutable, full access</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setEditor({ mode: "edit", role })}>
                              <Pencil className="mr-2 size-4" /> Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageShell>
      {editor && (
        <RoleEditor state={editor} onClose={() => setEditor(null)} onSaved={(message) => void handleSaved(message)} />
      )}
    </>
  );
}
