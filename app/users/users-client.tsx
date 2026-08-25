"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserStatus,
  updateUser,
  USER_LIST_PAGE_SIZE,
  type CanonicalLocationCode,
  type CreateUserRequest,
  type ManageableUserRole,
  type ManagedUserDto,
  type ManagedUserRole,
  type UpdateUserRequest,
  type UserStatusDto,
} from "@/lib/contracts/users";

/**
 * Admin User Management client (UI-SPEC surface 3/4/5).
 *
 * All list and mutation traffic goes through the typed same-origin client
 * functions in `lib/contracts/users.ts`; no mock fixtures remain. The owner
 * Admin row is visible but immutable, and every operation surfaces the exact
 * approved copy through role="status"/role="alert" regions.
 */

export type UsersLocationOption = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "BRANCH";
};

// --- Exact approved copy ---------------------------------------------------

const PAGE_TITLE = "User Management";
const PAGE_SUBTITLE =
  "Create and manage staff accounts, fixed roles, and location access.";

const LOAD_USERS_ERROR_COPY =
  "We couldn’t load users. Check your connection and try again.";
const EMPTY_HEADING = "No staff users yet";
const EMPTY_BODY =
  "Create a Stock Staff, Branch Staff, or Accounting Staff account to get started.";
const FILTERED_EMPTY_HEADING = "No users match these filters";
const FILTERED_EMPTY_BODY =
  "Change or reset the filters to see other staff accounts.";

const OFFLINE_PASSWORD_HELPER =
  "Share this temporary password through an offline channel — it is never displayed again.";
const STATUS_HELPER =
  "New accounts start active. You can deactivate an account after it is created.";
const REVOCATION_WARNING_COPY =
  "Changing this user’s role or branch will sign them out immediately.";

function createSuccessCopy(name: string) {
  return `${name} was created. Share the temporary password through an offline channel.`;
}
function createFailureCopy(name: string) {
  return `We couldn’t create ${name}. No account was created.`;
}
function updateSuccessCopy(name: string) {
  return `${name} was updated and signed out. Their new access applies the next time they sign in.`;
}
function updateFailureCopy(name: string) {
  return `We couldn’t save changes for ${name}. Their account details and access are unchanged.`;
}
function resetSuccessCopy(name: string) {
  return `Temporary password updated. Share it with ${name} through an offline channel.`;
}
function resetFailureCopy(name: string) {
  return `We couldn’t reset ${name}’s password. Their current password is unchanged.`;
}
function deactivateSuccessCopy(name: string) {
  return `${name} was deactivated and signed out.`;
}
function deactivateFailureCopy(name: string) {
  return `We couldn’t deactivate ${name}. They can still sign in.`;
}
function reactivateSuccessCopy(name: string) {
  return `${name} was reactivated.`;
}
function reactivateFailureCopy(name: string) {
  return `We couldn’t reactivate ${name}. They still cannot sign in.`;
}

// --- Human labels ----------------------------------------------------------

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "STOCK_STAFF", label: "Stock Staff" },
  { value: "BRANCH_STAFF", label: "Branch Staff" },
  { value: "ACCOUNTING_STAFF", label: "Accounting Staff" },
] as const satisfies ReadonlyArray<{ value: ManageableUserRole | "all"; label: string }>;

const CREATE_ROLE_OPTIONS: ReadonlyArray<{
  value: ManageableUserRole;
  label: string;
}> = [
  { value: "STOCK_STAFF", label: "Stock Staff" },
  { value: "BRANCH_STAFF", label: "Branch Staff" },
  { value: "ACCOUNTING_STAFF", label: "Accounting Staff" },
];

const STATUS_FILTER_OPTIONS: ReadonlyArray<{
  value: UserStatusDto | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

function staffRoleLabel(
  role: ManagedUserRole,
  isOwner: boolean,
): string {
  if (isOwner) return "Owner Admin";
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "STOCK_STAFF":
      return "Stock Staff";
    case "BRANCH_STAFF":
      return "Branch Staff";
    case "ACCOUNTING_STAFF":
      return "Accounting Staff";
  }
}

function locationScopeLabel(user: ManagedUserDto): string {
  if (user.role === "ADMIN" || user.role === "ACCOUNTING_STAFF") {
    return "Business-wide";
  }
  if (!user.location) return "Not assigned";
  if (user.location.code === "SR") return "Stock Room (SR)";
  return `${user.location.name} (${user.location.code})`;
}

function statusLabel(status: UserStatusDto): string {
  return status === "ACTIVE" ? "Active" : "Inactive";
}

/**
 * The safe list DTO intentionally carries no sign-in timestamp yet, so every
 * missing value reports `Never` per the partial-data contract until the API
 * adds the field.
 */
function formatLastSignIn(): string {
  return "Never";
}

// --- Validation (usability only; the server remains authoritative) ---------

function validateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the full name.";
  if (trimmed.length > 120) return "Use 120 characters or fewer.";
  return undefined;
}

function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter an email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Enter a valid email address.";
  }
  return undefined;
}

function validateTemporaryPassword(value: string): string | undefined {
  if (!value) return "Enter a temporary password.";
  if (value.length < 8) return "Use at least 8 characters.";
  if (value.length > 128) return "Use 128 characters or fewer.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Include at least one letter and one number.";
  }
  return undefined;
}

function validatePasswordConfirmation(
  password: string,
  confirm: string,
): string | undefined {
  if (!confirm) return "Confirm the temporary password.";
  if (password !== confirm) return "Passwords do not match.";
  return undefined;
}

function validateBranchSelection(locationId: string): string | undefined {
  if (!locationId) return "Select the staff member’s branch.";
  return undefined;
}

// --- Small building blocks --------------------------------------------------

type UsersSelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

function UsersSelect<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  triggerRef,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<UsersSelectOption<T>>;
  ariaLabel: string;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Select<T>
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next as T);
      }}
    >
      <SelectTrigger ref={triggerRef} className="w-full" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- Dialog state -----------------------------------------------------------

type DialogState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; user: ManagedUserDto }
  | { kind: "reset"; user: ManagedUserDto }
  | { kind: "status"; mode: "deactivate" | "reactivate"; user: ManagedUserDto };

type UserFormField = "name" | "email" | "branch" | "password" | "confirmPassword";

type UserFormErrors = Partial<Record<UserFormField, string>>;

// --- Main page client ---------------------------------------------------------

export function UsersClient({
  locations,
}: {
  locations: ReadonlyArray<UsersLocationOption>;
}) {
  const queryClient = useQueryClient();

  const [banner, setBanner] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  // Draft (uncommitted) filter controls.
  const [searchDraft, setSearchDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState<ManageableUserRole | "all">("all");
  const [locationDraft, setLocationDraft] = useState<
    CanonicalLocationCode | "none" | "all"
  >("all");
  const [statusDraft, setStatusDraft] = useState<UserStatusDto | "all">("all");

  // Applied filter state — the complete query key source of truth.
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedRole, setAppliedRole] = useState<ManageableUserRole | "all">("all");
  const [appliedLocation, setAppliedLocation] = useState<
    CanonicalLocationCode | "none" | "all"
  >("all");
  const [appliedStatus, setAppliedStatus] = useState<UserStatusDto | "all">("all");
  const [page, setPage] = useState(1);

  const locationFilterOptions = useMemo<UsersSelectOption<
    CanonicalLocationCode | "none" | "all"
  >[]>(() => {
    const options: UsersSelectOption<CanonicalLocationCode | "none" | "all">[] = [
      { value: "all", label: "All locations" },
    ];
    for (const location of locations) {
      options.push({
        value: location.code as CanonicalLocationCode,
        label:
          location.code === "SR"
            ? "Stock Room (SR)"
            : `${location.name} (${location.code})`,
      });
    }
    options.push({ value: "none", label: "Not assigned" });
    return options;
  }, [locations]);

  const query = useQuery({
    queryKey: [
      "users",
      {
        page,
        pageSize: USER_LIST_PAGE_SIZE,
        search: appliedSearch,
        role: appliedRole,
        location: appliedLocation,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      listUsers({
        page,
        ...(appliedSearch ? { search: appliedSearch.trim() } : {}),
        ...(appliedRole !== "all" ? { role: appliedRole } : {}),
        ...(appliedLocation !== "all" ? { location: appliedLocation } : {}),
        ...(appliedStatus !== "all" ? { status: appliedStatus } : {}),
      }),
    placeholderData: (previousData) => previousData,
  });

  const data = query.data;
  const rows = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    pageSize: USER_LIST_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    totalStaff: 0,
    activeStaff: 0,
    inactiveStaff: 0,
  };

  // A mutation or filter change can shrink the result set below the current
  // page; snap back to the last valid page instead of showing a phantom page.
  useEffect(() => {
    if (!data) return;
    if (data.meta.totalItems > 0 && page > data.meta.totalPages) {
      setPage(data.meta.totalPages);
    }
  }, [data, page]);

  const hasActiveFilters =
    appliedSearch !== "" ||
    appliedRole !== "all" ||
    appliedLocation !== "all" ||
    appliedStatus !== "all";

  const isInitialLoad = query.isLoading;
  const isRefreshing = query.isFetching && !query.isLoading;
  const loadError = query.error;

  function applyFilters(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPage(1);
    setAppliedSearch(searchDraft.trim());
    setAppliedRole(roleDraft);
    setAppliedLocation(locationDraft);
    setAppliedStatus(statusDraft);
  }

  function resetFilters() {
    setSearchDraft("");
    setRoleDraft("all");
    setLocationDraft("all");
    setStatusDraft("all");
    setAppliedSearch("");
    setAppliedRole("all");
    setAppliedLocation("all");
    setAppliedStatus("all");
    setPage(1);
  }

  async function handleMutationSuccess(bannerMessage: string) {
    setBanner(null);
    // Refresh the affected row and counts while preserving applied
    // filters/page whenever they remain valid (the clamp effect guards the
    // shrinking case).
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    setDialog({ kind: "none" });
    setBanner(bannerMessage);
  }

  function closeDialog() {
    setDialog({ kind: "none" });
  }

  const resultCountLabel =
    meta.totalItems === 1 ? "1 user" : `${meta.totalItems} users`;
  const showingFrom =
    meta.totalItems === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const showingTo =
    meta.totalItems === 0 ? 0 : Math.min(meta.page * meta.pageSize, meta.totalItems);

  const emptyState = hasActiveFilters ? "filtered" : "unfiltered";

  return (
    <>
      <PageShell title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} actions={
        <Button onClick={() => setDialog({ kind: "create" })}>Create User</Button>
      }>
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

        {/* Staff-only summary counts; the owner Admin is never counted. */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-muted-foreground text-sm">Total Staff</p>
              <h3 className="text-foreground mt-3 text-3xl font-bold">
                {meta.totalStaff}
              </h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-muted-foreground text-sm">Active</p>
              <h3 className="text-foreground mt-3 text-3xl font-bold">
                {meta.activeStaff}
              </h3>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-muted-foreground text-sm">Inactive</p>
              <h3 className="text-foreground mt-3 text-3xl font-bold">
                {meta.inactiveStaff}
              </h3>
            </CardContent>
          </Card>
        </div>

        {/* Filter card */}
        <Card className="mt-6">
          <CardContent className="p-5">
            <form
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"
              onSubmit={applyFilters}
            >
              <Input
                aria-label="Search name or email"
                placeholder="Search name or email"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />

              <UsersSelect
                value={roleDraft}
                onValueChange={setRoleDraft}
                options={ROLE_FILTER_OPTIONS}
                ariaLabel="Filter by role"
              />

              <UsersSelect
                value={locationDraft}
                onValueChange={setLocationDraft}
                options={locationFilterOptions}
                ariaLabel="Filter by location"
              />

              <UsersSelect
                value={statusDraft}
                onValueChange={setStatusDraft}
                options={STATUS_FILTER_OPTIONS}
                ariaLabel="Filter by status"
              />

              <div className="flex gap-2">
                <Button type="submit" className="flex-1">
                  Apply Filters
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={resetFilters}
                >
                  Reset Filters
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Table card */}
        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {meta.totalItems > 0 &&
                  `Showing ${showingFrom}–${showingTo} of ${resultCountLabel}`}
                {meta.totalItems > 0 && isRefreshing ? " · " : ""}
                {isRefreshing ? "Updating…" : ""}
              </p>
            </div>

            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Location Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sign-in</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isInitialLoad ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div
                        className="text-muted-foreground flex items-center justify-center gap-2 text-sm"
                        aria-live="polite"
                      >
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading users…
                      </div>
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                        <p role="alert" className="text-destructive break-words text-sm">
                          {LOAD_USERS_ERROR_COPY}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => void query.refetch()}
                        >
                          Try Again
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                        <p className="text-foreground text-base font-semibold">
                          {emptyState === "filtered"
                            ? FILTERED_EMPTY_HEADING
                            : EMPTY_HEADING}
                        </p>
                        <p className="text-muted-foreground text-sm">
                          {emptyState === "filtered" ? FILTERED_EMPTY_BODY : EMPTY_BODY}
                        </p>
                        {emptyState === "filtered" ? (
                          <Button variant="outline" onClick={resetFilters}>
                            Reset Filters
                          </Button>
                        ) : (
                          <Button onClick={() => setDialog({ kind: "create" })}>
                            Create User
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="text-foreground break-words font-medium">
                        {user.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground break-all">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        {user.isOwner ? (
                          <span className="text-foreground text-sm font-medium">
                            {staffRoleLabel(user.role, true)}
                          </span>
                        ) : (
                          <span className="text-foreground text-sm">
                            {staffRoleLabel(user.role, false)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground break-words text-sm">
                        {locationScopeLabel(user)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.status === "ACTIVE" ? "default" : "secondary"}
                        >
                          {statusLabel(user.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatLastSignIn()}
                      </TableCell>
                      <TableCell>
                        {user.isOwner ? (
                          <span
                            className="text-muted-foreground text-sm"
                            aria-label="The owner Admin account has no mutation actions"
                          >
                            —
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "edit", user })}
                            >
                              Edit User
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setDialog({ kind: "reset", user })}
                            >
                              Reset Password
                            </Button>
                            {user.status === "ACTIVE" ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setDialog({
                                    kind: "status",
                                    mode: "deactivate",
                                    user,
                                  })
                                }
                              >
                                Deactivate User
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDialog({
                                    kind: "status",
                                    mode: "reactivate",
                                    user,
                                  })
                                }
                              >
                                Reactivate User
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {meta.totalItems > 0 && (
              <div className="border-t flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-sm">
                  Page {meta.page} of {Math.max(meta.totalPages, 1)}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((previous) => Math.max(previous - 1, 1))}
                    disabled={meta.page <= 1 || isRefreshing}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                    Previous
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((previous) =>
                        Math.min(previous + 1, Math.max(meta.totalPages, 1)),
                      )
                    }
                    disabled={meta.page >= meta.totalPages || isRefreshing}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageShell>

    </>
  );
}
