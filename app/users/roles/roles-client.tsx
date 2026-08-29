"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, ShieldCheck, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ASSIGNABLE_CAPABILITY_CATALOG,
  createRole,
  listRoles,
  updateRole,
  type CapabilityId,
  type RoleDefinitionDto,
} from "@/lib/contracts/roles";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; role: RoleDefinitionDto }
  | null;

function RoleEditor({
  state,
  grantableCapabilities,
  onClose,
  onSaved,
}: {
  state: Exclude<EditorState, null>;
  grantableCapabilities: ReadonlyArray<CapabilityId>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const existing = state.mode === "edit" ? state.role : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [permissions, setPermissions] = useState<CapabilityId[]>(
    existing?.permissions ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const assignableCapabilities = ASSIGNABLE_CAPABILITY_CATALOG.filter((capability) =>
    grantableCapabilities.includes(capability.id),
  );
  const capabilityGroups = Array.from(
    assignableCapabilities.reduce((groups, capability) => {
      const items = groups.get(capability.module) ?? [];
      items.push(capability);
      groups.set(capability.module, items);
      return groups;
    }, new Map<string, Array<(typeof ASSIGNABLE_CAPABILITY_CATALOG)[number]>>()),
  );

  const mutation = useMutation({
    mutationFn: () =>
      existing
        ? updateRole(existing.id, {
            name,
            description,
            permissions,
            version: existing.version,
          })
        : createRole({ name, description, permissions }),
    onSuccess: (role) =>
      onSaved(
        existing ? `${role.name} was updated.` : `${role.name} was created.`,
      ),
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
    <Dialog
      open
      onOpenChange={(open) => !open && !mutation.isPending && onClose()}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Role" : "Create Role"}</DialogTitle>
          <DialogDescription>
            Assign only the capabilities this role needs. Changes to permissions
            sign out assigned users.
          </DialogDescription>
        </DialogHeader>
        <form
          id="role-editor-form"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1"
          onSubmit={submit}
        >
          <div className="grid gap-4">
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
                <p className="text-muted-foreground text-sm">
                  {permissions.length} selected. Action permissions automatically
                  include the module view needed to use them.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutation.isPending}
                onClick={() =>
                  setPermissions(
                    permissions.length === assignableCapabilities.length
                      ? []
                      : assignableCapabilities.map(
                          (capability) => capability.id,
                        ),
                  )
                }
              >
                {permissions.length === assignableCapabilities.length
                  ? "Clear All"
                  : "Select All"}
              </Button>
            </div>
            {capabilityGroups.map(([module, capabilities]) => (
              <fieldset key={module} className="rounded-xl border p-4">
                <legend className="px-1 text-sm font-semibold">{module}</legend>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => {
                    const ids = capabilities.map((capability) => capability.id);
                    const allSelected = ids.every((id) => permissions.includes(id));
                    setPermissions((current) =>
                      allSelected
                        ? current.filter((id) => !ids.includes(id))
                        : [...new Set([...current, ...ids])],
                    );
                  }}
                >
                  {capabilities.every((capability) => permissions.includes(capability.id))
                    ? "Clear group"
                    : "Select group"}
                </Button>
                <div className="grid gap-3 pt-2 md:grid-cols-2">
                  {capabilities.map((capability) => (
                    <label
                      key={capability.id}
                      className="flex items-center gap-3 text-sm"
                    >
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
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
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
            {mutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {existing ? "Save Changes" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RolesClient({
  capabilities,
  currentRoleId,
}: {
  capabilities: ReadonlyArray<CapabilityId>;
  currentRoleId: string;
}) {
  const queryClient = useQueryClient();
  const canCreate = capabilities.includes("roles:create");
  const canUpdate = capabilities.includes("roles:update");
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
        actions={canCreate ? (
          <div className="flex flex-wrap gap-2">
            {/* <Link href="/users" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft className="mr-2 size-4" /> Back to Users
            </Link> */}
            <Button onClick={() => setEditor({ mode: "create" })}>
              Create Role
            </Button>
          </div>
        ) : undefined}
      >
        {banner && (
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
        )}
        <Card>
          <CardContent className="p-0">
            {query.isLoading ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading roles...
              </div>
            ) : query.isError ? (
              <div className="py-16 text-center">
                <p role="alert" className="text-destructive text-sm">
                  We could not load roles.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => void query.refetch()}
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="bg-muted/50 border-b text-left text-xs uppercase">
                    <tr>
                      <th className="px-5 py-3">Role</th>
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
                            {role.isOwner && (
                              <ShieldCheck className="text-primary size-4" />
                            )}
                            {role.name}
                            {role.isSystem && (
                              <Badge variant="secondary">Built-in</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-1 max-w-md text-sm">
                            {role.description || "No description"}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {role.assignedUserCount}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {role.permissions.length}
                        </td>
                        <td className="px-5 py-4">
                          {role.isOwner ? (
                            <Badge variant="outline">
                              Immutable, full access
                            </Badge>
                          ) : canUpdate &&
                            role.id !== currentRoleId &&
                            role.permissions.every((permission) =>
                              capabilities.includes(permission),
                            ) ? (
                            <Button
                              size="sm"
                              variant="edit"
                              onClick={() => setEditor({ mode: "edit", role })}
                            >
                              <Pencil className="mr-2 size-4" /> Edit
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
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
      {editor &&
        ((editor.mode === "create" && canCreate) ||
          (editor.mode === "edit" && canUpdate)) && (
        <RoleEditor
          state={editor}
          grantableCapabilities={capabilities}
          onClose={() => setEditor(null)}
          onSaved={(message) => void handleSaved(message)}
        />
      )}
    </>
  );
}
