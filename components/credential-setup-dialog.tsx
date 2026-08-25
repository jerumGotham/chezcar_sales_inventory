"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

/**
 * Masked input with an accessible visibility toggle. Values stay in the
 * dialog's local state; the toggle only changes the rendered input type.
 */
function PasswordInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  autoFocus,
  autoComplete,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  autoComplete: "current-password" | "new-password";
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        required
        disabled={disabled}
        autoComplete={autoComplete}
        className="pr-10"
        autoFocus={autoFocus}
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

/**
 * Blocking first-login temporary-password prompt (UI-SPEC surface 6).
 *
 * Exact approved copy; Current/New/Confirm masked fields; primary
 * `Change Password`, secondary `Skip for Now`. Password values live only in
 * local component state, are cleared on completion, and are never placed in
 * URLs, caches, logs, or page text.
 */

/** Mirrors the stable server envelope copy (kept client-local: server module is server-only). */
const CHANGE_FAILURE_COPY =
  "We couldn’t change your password. Your current password is unchanged.";

type FieldName = "currentPassword" | "newPassword" | "confirmPassword";

type FieldErrors = Partial<Record<FieldName, string>>;

function validateField(
  field: FieldName,
  values: Record<FieldName, string>,
): string | undefined {
  const value = values[field];
  switch (field) {
    case "currentPassword":
      if (!value) return "Enter your current password.";
      return undefined;
    case "newPassword": {
      if (!value) return "Enter a new password.";
      if (value.length < 8) return "Use at least 8 characters.";
      if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
        return "Include at least one letter and one number.";
      }
      return undefined;
    }
    case "confirmPassword":
      if (!value) return "Confirm your new password.";
      if (values.newPassword && value !== values.newPassword) {
        return "Passwords do not match.";
      }
      return undefined;
  }
}

export function CredentialSetupDialog({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverAlert, setServerAlert] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"change" | "skip" | null>(
    null,
  );

  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const values: Record<FieldName, string> = {
    currentPassword,
    newPassword,
    confirmPassword,
  };

  function clearSecrets() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFieldErrors({});
    setServerAlert(null);
  }

  function setFieldError(field: FieldName, message: string | undefined) {
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  function handleBlur(
    field: FieldName,
    relatedTarget?: EventTarget | null,
  ) {
    if (pendingAction) return;
    // Moving focus to Skip is an intentional exit, not an incomplete entry:
    // never surface validation for a field the user chose not to fill.
    if (relatedTarget instanceof Element && relatedTarget.id === "credential-skip-button") {
      return;
    }
    setFieldError(field, validateField(field, values));
  }

  function focusFirstInvalid(errors: FieldErrors) {
    const order: FieldName[] = [
      "currentPassword",
      "newPassword",
      "confirmPassword",
    ];
    for (const field of order) {
      if (errors[field]) {
        const refs = {
          currentPassword: currentPasswordRef,
          newPassword: newPasswordRef,
          confirmPassword: confirmPasswordRef,
        };
        refs[field].current?.focus();
        return true;
      }
    }
    return false;
  }

  async function postAction(body: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/credential-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) return true;

      let message = CHANGE_FAILURE_COPY;
      try {
        const failure = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        if (
          failure.error?.code === "CREDENTIAL_CHANGE_FAILED" &&
          failure.error.message
        ) {
          message = failure.error.message;
        }
      } catch {
        // Non-JSON failures keep the fixed copy above.
      }
      setServerAlert(message);
      return false;
    } catch {
      setServerAlert(CHANGE_FAILURE_COPY);
      return false;
    }
  }

  async function submitChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await doChange();
  }

  async function doChange() {
    if (pendingAction) return;

    setServerAlert(null);
    const errors: FieldErrors = {};
    for (const field of [
      "currentPassword",
      "newPassword",
      "confirmPassword",
    ] as FieldName[]) {
      const message = validateField(field, values);
      if (message) errors[field] = message;
    }
    setFieldErrors(errors);
    if (focusFirstInvalid(errors)) return;

    setPendingAction("change");
    const succeeded = await postAction({
      action: "change",
      currentPassword,
      newPassword,
      confirmPassword,
    });
    setPendingAction(null);
    if (succeeded) {
      clearSecrets();
      onComplete();
    }
  }

  async function handleSkip() {
    if (pendingAction) return;
    setServerAlert(null);
    setPendingAction("skip");
    const succeeded = await postAction({ action: "skip" });
    setPendingAction(null);
    if (succeeded) {
      // A successful skip makes no password-change claim anywhere.
      clearSecrets();
      onComplete();
    }
  }

  const isBusy = pendingAction !== null;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md gap-4"
        showCloseButton={false}
        aria-labelledby="credential-setup-title"
        aria-describedby="credential-setup-description"
      >
        <DialogHeader>
          <DialogTitle id="credential-setup-title">
            Change your temporary password
          </DialogTitle>
          <DialogDescription id="credential-setup-description">
            Choose a private password now, or skip this step and continue.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submitChange} noValidate>
          <div className="space-y-2">
            <Label htmlFor="credential-current-password">Current Password</Label>
            <PasswordInput
              inputRef={currentPasswordRef}
              id="credential-current-password"
              value={currentPassword}
              disabled={isBusy}
              invalid={Boolean(fieldErrors.currentPassword)}
              describedBy={
                fieldErrors.currentPassword
                  ? "credential-current-password-error"
                  : undefined
              }
              autoFocus
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              onBlur={(event) =>
                handleBlur("currentPassword", event.relatedTarget)
              }
            />
            {fieldErrors.currentPassword && (
              <p
                id="credential-current-password-error"
                className="text-destructive text-xs font-semibold"
              >
                {fieldErrors.currentPassword}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-new-password">New Password</Label>
            <PasswordInput
              inputRef={newPasswordRef}
              id="credential-new-password"
              value={newPassword}
              disabled={isBusy}
              invalid={Boolean(fieldErrors.newPassword)}
              describedBy={
                fieldErrors.newPassword
                  ? "credential-new-password-error"
                  : undefined
              }
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              onBlur={(event) =>
                handleBlur("newPassword", event.relatedTarget)
              }
            />
            {fieldErrors.newPassword && (
              <p
                id="credential-new-password-error"
                className="text-destructive text-xs font-semibold"
              >
                {fieldErrors.newPassword}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential-confirm-password">
              Confirm New Password
            </Label>
            <PasswordInput
              inputRef={confirmPasswordRef}
              id="credential-confirm-password"
              value={confirmPassword}
              disabled={isBusy}
              invalid={Boolean(fieldErrors.confirmPassword)}
              describedBy={
                fieldErrors.confirmPassword
                  ? "credential-confirm-password-error"
                  : undefined
              }
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              onBlur={(event) =>
                handleBlur("confirmPassword", event.relatedTarget)
              }
            />
            {fieldErrors.confirmPassword && (
              <p
                id="credential-confirm-password-error"
                className="text-destructive text-xs font-semibold"
              >
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {serverAlert && (
            <div
              role="alert"
              className="bg-destructive/10 space-y-2 rounded-xl px-3 py-2"
            >
              <p className="text-destructive text-sm">{serverAlert}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={isBusy}
                onClick={doChange}
              >
                Try Changing Password Again
              </Button>
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {pendingAction === "change" && "Changing password…"}
            {pendingAction === "skip" && "Skipping password change…"}
          </p>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:justify-start">
            {/* Footer order per UI-SPEC: context-specific secondary, then primary. */}
            <Button
              type="submit"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={isBusy}
            >
              {pendingAction === "change" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {pendingAction === "change" ? "Changing Password…" : "Change Password"}
            </Button>
            <Button
              type="button"
              id="credential-skip-button"
              variant="outline"
              className="w-full"
              disabled={isBusy}
              onClick={handleSkip}
            >
              {pendingAction === "skip" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {pendingAction === "skip" ? "Skipping…" : "Skip for Now"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
