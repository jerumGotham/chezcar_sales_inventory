"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";

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
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RULE_TEXT, describePasswordProblem } from "@/lib/contracts/users";

/**
 * Better Auth answers with a bare "Invalid password", which reads as if the new
 * password were rejected when it is the current one that did not match. Each
 * code is restated to name the field the person has to fix.
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "The current password is incorrect. Check it and try again.",
  PASSWORD_TOO_SHORT: `The new password is too short. ${PASSWORD_RULE_TEXT}`,
  PASSWORD_TOO_LONG: "The new password is too long. Use 128 characters or fewer.",
  UNAUTHORIZED: "Your session has expired. Sign in again, then change your password.",
  SESSION_EXPIRED: "Your session has expired. Sign in again, then change your password.",
};

function PasswordField({ id, name, label, autoComplete, describedBy }: { id: string; name: string; label: string; autoComplete: string; describedBy?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required aria-describedby={describedBy} className="pr-10" />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition hover:text-foreground"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          tabIndex={-1}
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </div>
  );
}

/**
 * Every signed-in user can change their own password here. The admin reset at
 * /api/users/:userId/password is a different thing: it sets someone else's
 * password without knowing the old one, and needs users:reset-password.
 */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setError("");
      setDone(false);
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    const problem = describePasswordProblem(newPassword);
    if (problem) {
      // The shared rule messages open with "Password"; name the field instead.
      setError(`${problem.replace(/^Password/, "The new password")}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match. Retype them.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("The new password is the same as the current one. Choose a different one.");
      return;
    }

    setPending(true);
    setError("");
    try {
      // Other devices keep their session; only this password changes.
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (result.error) throw new Error(ERROR_MESSAGES[result.error.code ?? ""] ?? result.error.message ?? "Unable to change the password.");
      form.reset();
      setDone(true);
    } catch (caught) {
      setError(caught instanceof TypeError ? "Could not reach the server. Check your connection and try again." : caught instanceof Error ? caught.message : "Unable to change the password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then the new one twice.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-4">
            <p role="status" className="rounded-md bg-muted p-3 text-sm">Password changed. Use the new one the next time you sign in.</p>
            <DialogFooter>
              <Button type="button" onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              <PasswordField id="currentPassword" name="currentPassword" label="Current password" autoComplete="current-password" />
              <div className="grid gap-2">
                <PasswordField id="newPassword" name="newPassword" label="New password" autoComplete="new-password" describedBy="new-password-help" />
                <p id="new-password-help" className="text-sm text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
              </div>
              <PasswordField id="confirmPassword" name="confirmPassword" label="Repeat the new password" autoComplete="new-password" />
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>
                  <KeyRound aria-hidden="true" />
                  {pending ? "Changing..." : "Change password"}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
