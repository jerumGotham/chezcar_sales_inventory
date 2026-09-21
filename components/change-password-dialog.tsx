"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";

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
      setError(problem);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("The new password must be different from the current one.");
      return;
    }

    setPending(true);
    setError("");
    try {
      // Other devices keep their session; only this password changes.
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: false });
      if (result.error) throw new Error(result.error.message ?? "Unable to change the password.");
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
              <div className="grid gap-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required aria-describedby="new-password-help" />
                <p id="new-password-help" className="text-sm text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Repeat the new password</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
              </div>
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
