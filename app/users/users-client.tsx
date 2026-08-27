"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, TriangleAlert, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
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
 * Renders the DTO's last sign-in timestamp in the user's locale, or `Never`
 * when the account holds no session record.
 */
function formatLastSignIn(lastSignInAt: string | null): string {
  if (!lastSignInAt) return "Never";
  return new Date(lastSignInAt).toLocaleString();
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
  // Mirrors the server contract: the domain TLD needs at least two letters,
  // so addresses like `name@a.a` are rejected before submission.
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(trimmed)) {
    return "Enter a valid email address, such as name@company.com.";
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

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="text-destructive text-xs font-semibold">
      {message}
    </p>
  );
}

/**
 * Masked input with an accessible visibility toggle. The value stays in the
 * parent's state; the toggle only changes the rendered input type.
 */
function PasswordInput({
  ref,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  id,
}: {
  ref: Ref<HTMLInputElement>;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  id: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        required
        disabled={disabled}
        autoComplete="new-password"
        className="pr-10"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={onChange}
        onBlur={onBlur}
      />
      <button
        type="button"
        onClick={() => setVisible((previous) => !previous)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

function ReadOnlyScopeDisplay({ label }: { label: string }) {
  return (
    <div
      className="border-input bg-muted/40 text-muted-foreground flex h-8 w-full items-center rounded-lg border px-2.5 text-sm"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

function MutationAlert({
  message,
  retryLabel,
  onRetry,
  disabled,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <div role="alert" className="bg-destructive/10 space-y-2 rounded-xl px-3 py-2">
      <p className="text-destructive break-words text-sm">{message}</p>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-full"
        disabled={disabled}
        onClick={onRetry}
      >
        {retryLabel}
      </Button>
    </div>
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

// --- Shared user form (create + edit) ---------------------------------------

function UserFormDialog({
  mode,
  user,
  locations,
  onCompleted,
  onCancel,
}: {
  mode: "create" | "edit";
  user?: ManagedUserDto;
  locations: ReadonlyArray<UsersLocationOption>;
  onCompleted: (bannerMessage: string) => void;
  onCancel: () => void;
}) {
  const isCreate = mode === "create";

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<ManageableUserRole>(
    user && user.role !== "ADMIN" ? user.role : "STOCK_STAFF",
  );
  const [branchLocationId, setBranchLocationId] = useState(
    user?.location && user.location.code !== "SR" ? user.location.id : "",
  );
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<UserStatusDto>("ACTIVE");
  const [fieldErrors, setFieldErrors] = useState<UserFormErrors>({});
  const [serverAlert, setServerAlert] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLButtonElement | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const branchOptions = useMemo(
    () =>
      locations
        .filter((location) => location.type === "BRANCH")
        .map((location) => ({
          value: location.id,
          label: `${location.name} (${location.code})`,
        })),
    [locations],
  );

  const originalLocationId = user?.location?.id ?? null;
  const nextLocationId = role === "BRANCH_STAFF" ? branchLocationId || null : null;
  const accessWillChange =
    !isCreate &&
    Boolean(user) &&
    (role !== user!.role || nextLocationId !== originalLocationId);

  function handleRoleChange(next: ManageableUserRole) {
    setRole(next);
    // Changing role clears an incompatible prior location before submit.
    if (next !== "BRANCH_STAFF") {
      setBranchLocationId("");
    }
    setFieldErrors((previous) => {
      const next2 = { ...previous };
      delete next2.branch;
      return next2;
    });
  }

  function validateField(field: UserFormField): string | undefined {
    switch (field) {
      case "name":
        return validateName(name);
      case "email":
        return validateEmail(email);
      case "branch":
        return role === "BRANCH_STAFF"
          ? validateBranchSelection(branchLocationId)
          : undefined;
      case "password":
        return isCreate ? validateTemporaryPassword(temporaryPassword) : undefined;
      case "confirmPassword":
        return isCreate
          ? validatePasswordConfirmation(temporaryPassword, confirmPassword)
          : undefined;
    }
  }

  function handleBlur(field: UserFormField) {
    if (mutation.isPending) return;
    const message = validateField(field);
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  const FIELD_ORDER: UserFormField[] = [
    "name",
    "email",
    "branch",
    "password",
    "confirmPassword",
  ];

  function focusFirstInvalid(errors: UserFormErrors): boolean {
    const refs: Record<UserFormField, Ref<HTMLInputElement | HTMLButtonElement>> = {
      name: nameRef,
      email: emailRef,
      branch: branchRef,
      password: passwordRef,
      confirmPassword: confirmPasswordRef,
    };
    for (const field of FIELD_ORDER) {
      if (errors[field]) {
        const target = refs[field];
        if (target && "current" in target && target.current) {
          target.current.focus();
        }
        return true;
      }
    }
    return false;
  }

  const mutation = useMutation({
    mutationFn: async (variables: {
      request: CreateUserRequest | UpdateUserRequest;
      displayName: string;
    }) => {
      if (isCreate) {
        await createUser(variables.request as CreateUserRequest);
      } else {
        await updateUser(user!.id, variables.request as UpdateUserRequest);
      }
      return variables.displayName;
    },
    onSuccess: (displayName) => {
      onCompleted(
        isCreate ? createSuccessCopy(displayName) : updateSuccessCopy(displayName),
      );
    },
    onError: (_error, variables) => {
      setServerAlert(
        isCreate ? createFailureCopy(variables.displayName) : updateFailureCopy(variables.displayName),
      );
    },
  });

  const isBusy = mutation.isPending;

  async function doSubmit() {
    if (isBusy) return;
    setServerAlert(null);

    const errors: UserFormErrors = {};
    for (const field of FIELD_ORDER) {
      const message = validateField(field);
      if (message) errors[field] = message;
    }
    setFieldErrors(errors);
    if (focusFirstInvalid(errors)) return;

    const displayName = name.trim();
    const trimmedEmail = email.trim();

    if (isCreate) {
      // Written per-branch (not spread from a shared base) so the
      // discriminated-union create contract stays exactly satisfied.
      const request: CreateUserRequest =
        role === "BRANCH_STAFF"
          ? {
              role,
              name: displayName,
              email: trimmedEmail,
              temporaryPassword,
              locationId: branchLocationId,
            }
          : {
              role,
              name: displayName,
              email: trimmedEmail,
              temporaryPassword,
            };
      mutation.mutate({ request, displayName });
      return;
    }

    const request: UpdateUserRequest = {
      name: displayName,
      email: trimmedEmail,
      role,
      locationId: role === "BRANCH_STAFF" ? branchLocationId : null,
    };
    mutation.mutate({ request, displayName });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void doSubmit();
  }

  function closeIfIdle() {
    if (isBusy) return;
    onCancel();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeIfIdle();
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create User" : "Edit User"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Set a fixed role and location scope. The temporary password is changed at first sign-in."
              : "Update account details, fixed role, and location scope."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-form-name">Full Name</Label>
                <Input
                  ref={nameRef}
                  id="user-form-name"
                  value={name}
                  required
                  disabled={isBusy}
                  autoComplete="off"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={
                    fieldErrors.name ? "user-form-name-error" : undefined
                  }
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => handleBlur("name")}
                />
                {fieldErrors.name && (
                  <FieldError
                    id="user-form-name-error"
                    message={fieldErrors.name}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-form-email">Email Address</Label>
                <Input
                  ref={emailRef}
                  id="user-form-email"
                  type="email"
                  value={email}
                  required
                  disabled={isBusy}
                  autoComplete="off"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={
                    fieldErrors.email ? "user-form-email-error" : undefined
                  }
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={() => handleBlur("email")}
                />
                {fieldErrors.email && (
                  <FieldError
                    id="user-form-email-error"
                    message={fieldErrors.email}
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-form-role">Role</Label>
                {/* Fixed staff roles only — Admin is never an option. */}
                <UsersSelect
                  value={role}
                  onValueChange={handleRoleChange}
                  options={CREATE_ROLE_OPTIONS}
                  ariaLabel="Role"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={role === "BRANCH_STAFF" ? "user-form-branch" : undefined}>
                  Location Scope
                </Label>
                {role === "STOCK_STAFF" && (
                  <ReadOnlyScopeDisplay label="Stock Room (SR)" />
                )}
                {role === "ACCOUNTING_STAFF" && (
                  <ReadOnlyScopeDisplay label="Business-wide" />
                )}
                {role === "BRANCH_STAFF" && (
                  <>
                    <UsersSelect
                      value={branchLocationId}
                      onValueChange={(next) => {
                        setBranchLocationId(next);
                        setFieldErrors((previous) => {
                          const next2 = { ...previous };
                          delete next2.branch;
                          return next2;
                        });
                      }}
                      options={branchOptions}
                      ariaLabel="Branch"
                      triggerRef={branchRef}
                    />
                    {fieldErrors.branch && (
                      <FieldError
                        id="user-form-branch-error"
                        message={fieldErrors.branch}
                      />
                    )}
                  </>
                )}
              </div>

              {isCreate && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="user-form-password">Temporary Password</Label>
                    <PasswordInput
                      ref={passwordRef}
                      id="user-form-password"
                      value={temporaryPassword}
                      disabled={isBusy}
                      invalid={Boolean(fieldErrors.password)}
                      describedBy="user-form-password-helper"
                      onChange={(event) => setTemporaryPassword(event.target.value)}
                      onBlur={() => handleBlur("password")}
                    />
                    {fieldErrors.password && (
                      <FieldError
                        id="user-form-password-error"
                        message={fieldErrors.password}
                      />
                    )}
                    <p
                      id="user-form-password-helper"
                      className="text-muted-foreground text-xs"
                    >
                      {OFFLINE_PASSWORD_HELPER}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-form-confirm-password">
                      Confirm Temporary Password
                    </Label>
                    <PasswordInput
                      ref={confirmPasswordRef}
                      id="user-form-confirm-password"
                      value={confirmPassword}
                      disabled={isBusy}
                      invalid={Boolean(fieldErrors.confirmPassword)}
                      describedBy={
                        fieldErrors.confirmPassword
                          ? "user-form-confirm-password-error"
                          : undefined
                      }
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onBlur={() => handleBlur("confirmPassword")}
                    />
                    {fieldErrors.confirmPassword && (
                      <FieldError
                        id="user-form-confirm-password-error"
                        message={fieldErrors.confirmPassword}
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user-form-status">Status</Label>
                    <UsersSelect
                      value={status}
                      onValueChange={setStatus}
                      options={[
                        { value: "ACTIVE", label: "Active" },
                        {
                          value: "INACTIVE",
                          label: "Inactive",
                          // The durable create API provisions active accounts;
                          // deactivate after creation instead of pretending.
                          disabled: true,
                        },
                      ]}
                      ariaLabel="Status"
                    />
                    <p className="text-muted-foreground text-xs">{STATUS_HELPER}</p>
                  </div>
                </>
              )}
            </div>

            {serverAlert && (
              <MutationAlert
                message={serverAlert}
                retryLabel={isCreate ? "Try Creating User Again" : "Try Saving Changes Again"}
                onRetry={() => void doSubmit()}
                disabled={isBusy}
              />
            )}

            <p className="sr-only" aria-live="polite">
              {isBusy && (isCreate ? "Creating user…" : "Saving changes…")}
            </p>
          </form>
        </div>

        {!isCreate && accessWillChange && (
          <div className="border-border bg-muted/50 flex items-start gap-2 rounded-xl border px-3 py-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-foreground break-words text-sm">
              {REVOCATION_WARNING_COPY}
            </p>
          </div>
        )}

        <DialogFooter>
          {/* preventDefault on mousedown keeps focus in the field, so blur
              validation cannot re-render and shift the footer before the
              click completes (the swallowed-first-click bug). */}
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={closeIfIdle}
          >
            {isCreate ? "Close Without Creating" : "Close Without Saving"}
          </Button>
          {/* Outside the scrollable <form>, so the click handler drives submission. */}
          <Button
            type="button"
            disabled={isBusy}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void doSubmit()}
          >
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isBusy
              ? isCreate
                ? "Creating User…"
                : "Saving Changes…"
              : isCreate
                ? "Create User"
                : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Credential reset dialog -------------------------------------------------

function ResetPasswordDialog({
  user,
  onCompleted,
  onCancel,
}: {
  user: ManagedUserDto;
  onCompleted: (bannerMessage: string) => void;
  onCancel: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<"newPassword" | "confirmPassword", string>>
  >({});
  const [serverAlert, setServerAlert] = useState<string | null>(null);

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (variables: { newPassword: string }) =>
      resetUserPassword(user.id, variables.newPassword),
    onSuccess: () => onCompleted(resetSuccessCopy(user.name)),
    onError: () => setServerAlert(resetFailureCopy(user.name)),
  });

  const isBusy = mutation.isPending;

  function validate(field: "newPassword" | "confirmPassword") {
    if (field === "newPassword") {
      return validateTemporaryPassword(newPassword);
    }
    return validatePasswordConfirmation(newPassword, confirmPassword);
  }

  function handleBlur(field: "newPassword" | "confirmPassword") {
    if (isBusy) return;
    const message = validate(field);
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  async function doReset() {
    if (isBusy) return;
    setServerAlert(null);
    const errors: Partial<
      Record<"newPassword" | "confirmPassword", string>
    > = {
      newPassword: validateTemporaryPassword(newPassword),
      confirmPassword: validatePasswordConfirmation(newPassword, confirmPassword),
    };
    setFieldErrors(errors);
    if (errors.newPassword) {
      newPasswordRef.current?.focus();
      return;
    }
    if (errors.confirmPassword) {
      confirmPasswordRef.current?.focus();
      return;
    }
    mutation.mutate({ newPassword });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) onCancel();
      }}
    >
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Reset Temporary Password</DialogTitle>
          <DialogDescription>
            Set a new temporary password for {user.name}. They will change it at
            their next sign-in.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void doReset();
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="reset-temporary-password">Temporary Password</Label>
            <Input
              ref={newPasswordRef}
              id="reset-temporary-password"
              type="password"
              value={newPassword}
              required
              disabled={isBusy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.newPassword ? true : undefined}
              aria-describedby={
                fieldErrors.newPassword
                  ? "reset-temporary-password-error"
                  : undefined
              }
              onChange={(event) => setNewPassword(event.target.value)}
              onBlur={() => handleBlur("newPassword")}
            />
            {fieldErrors.newPassword && (
              <FieldError
                id="reset-temporary-password-error"
                message={fieldErrors.newPassword}
              />
            )}
            <p className="text-muted-foreground text-xs">
              {OFFLINE_PASSWORD_HELPER}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">
              Confirm Temporary Password
            </Label>
            <Input
              ref={confirmPasswordRef}
              id="reset-confirm-password"
              type="password"
              value={confirmPassword}
              required
              disabled={isBusy}
              autoComplete="new-password"
              aria-invalid={fieldErrors.confirmPassword ? true : undefined}
              aria-describedby={
                fieldErrors.confirmPassword
                  ? "reset-confirm-password-error"
                  : undefined
              }
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={() => handleBlur("confirmPassword")}
            />
            {fieldErrors.confirmPassword && (
              <FieldError
                id="reset-confirm-password-error"
                message={fieldErrors.confirmPassword}
              />
            )}
          </div>

          {serverAlert && (
            <MutationAlert
              message={serverAlert}
              retryLabel="Try Resetting Password Again"
              onRetry={() => void doReset()}
              disabled={isBusy}
            />
          )}

          <p className="sr-only" aria-live="polite">
            {isBusy && "Resetting password…"}
          </p>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-start">
            <Button
              type="submit"
              className="w-full"
              disabled={isBusy}
            >
              {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isBusy ? "Resetting Password…" : "Reset Password"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={onCancel}
            >
              Keep Current Password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Lifecycle confirmation dialog -------------------------------------------

function StatusDialog({
  mode,
  user,
  onCompleted,
  onCancel,
}: {
  mode: "deactivate" | "reactivate";
  user: ManagedUserDto;
  onCompleted: (bannerMessage: string) => void;
  onCancel: () => void;
}) {
  const [serverAlert, setServerAlert] = useState<string | null>(null);

  const isDeactivate = mode === "deactivate";

  const mutation = useMutation({
    mutationFn: async () =>
      setUserStatus(user.id, isDeactivate ? "INACTIVE" : "ACTIVE"),
    onSuccess: () =>
      onCompleted(
        isDeactivate
          ? deactivateSuccessCopy(user.name)
          : reactivateSuccessCopy(user.name),
      ),
    onError: () =>
      setServerAlert(
        isDeactivate
          ? deactivateFailureCopy(user.name)
          : reactivateFailureCopy(user.name),
      ),
  });

  const isBusy = mutation.isPending;

  function doAction() {
    if (isBusy) return;
    setServerAlert(null);
    mutation.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) onCancel();
      }}
    >
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>
            {isDeactivate ? "Deactivate User" : "Reactivate User"}
          </DialogTitle>
          <DialogDescription>
            {isDeactivate
              ? `Deactivate ${user.name}? They will be signed out immediately and cannot sign in until reactivated.`
              : `Reactivate ${user.name}? They will be able to sign in with their current credentials.`}
          </DialogDescription>
        </DialogHeader>

        {serverAlert && (
          <MutationAlert
            message={serverAlert}
            retryLabel={
              isDeactivate ? "Try Deactivating Again" : "Try Reactivating Again"
            }
            onRetry={doAction}
            disabled={isBusy}
          />
        )}

        <p className="sr-only" aria-live="polite">
          {isBusy &&
            (isDeactivate ? "Deactivating user…" : "Reactivating user…")}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={onCancel}
          >
            {isDeactivate ? "Keep User Active" : "Keep User Inactive"}
          </Button>
          <Button
            type="button"
            variant={isDeactivate ? "destructive" : "default"}
            disabled={isBusy}
            onClick={doAction}
          >
            {isBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isBusy
              ? isDeactivate
                ? "Deactivating…"
                : "Reactivating…"
              : isDeactivate
                ? "Deactivate User"
                : "Reactivate User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
      // Keep the paginator inside the server-reported page range.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
                        {formatLastSignIn(user.lastSignInAt)}
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

      {dialog.kind === "create" && (
        <UserFormDialog
          mode="create"
          locations={locations}
          onCompleted={(message) => void handleMutationSuccess(message)}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === "edit" && (
        <UserFormDialog
          mode="edit"
          user={dialog.user}
          locations={locations}
          onCompleted={(message) => void handleMutationSuccess(message)}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === "reset" && (
        <ResetPasswordDialog
          user={dialog.user}
          onCompleted={(message) => void handleMutationSuccess(message)}
          onCancel={closeDialog}
        />
      )}

      {dialog.kind === "status" && (
        <StatusDialog
          mode={dialog.mode}
          user={dialog.user}
          onCompleted={(message) => void handleMutationSuccess(message)}
          onCancel={closeDialog}
        />
      )}
    </>
  );
}
