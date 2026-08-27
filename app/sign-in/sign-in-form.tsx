"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

import { CredentialSetupDialog } from "@/components/credential-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credentialPhase, setCredentialPhase] = useState<
    "none" | "checking" | "required"
  >("none");

  async function navigateToCallback() {
    router.replace(callbackUrl as Route);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = await authClient.signIn.email({ email, password });

    if (result.error) {
      setError("Invalid email or password.");
      setIsSubmitting(false);
      return;
    }

    // D-15: before navigating, check whether this login must still consume
    // the first-login temporary-password prompt. A transient state-check
    // failure never blocks navigation; the unconsumed prompt re-arms on the
    // next sign-in because nothing consumed it server-side.
    setCredentialPhase("checking");
    let setupState: "unknown" | "not-required" | "required" | "inactive" =
      "unknown";
    try {
      const response = await fetch("/api/credential-setup");
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { credentialSetupRequired?: boolean };
        };
        setupState =
          body.data?.credentialSetupRequired === true
            ? "required"
            : "not-required";
      } else if (response.status === 401 || response.status === 403) {
        // Credentials matched, but the persisted account is inactive or
        // revoked. Clear the just-created session instead of redirecting
        // into a sign-in loop.
        setupState = "inactive";
      }
    } catch {
      // Fall through to normal navigation.
    }

    if (setupState === "inactive") {
      await authClient.signOut();
      setError(
        "Your account has been deactivated. Contact your administrator.",
      );
      setCredentialPhase("none");
      setIsSubmitting(false);
      return;
    }

    if (setupState === "required") {
      setCredentialPhase("required");
      setIsSubmitting(false);
      return;
    }

    setCredentialPhase("none");
    setPassword("");
    await navigateToCallback();
  }

  function handleCredentialComplete() {
    setCredentialPhase("none");
    setPassword("");
    void navigateToCallback();
  }

  return (
    <Card className="w-full max-w-md border-emerald-100 bg-white/95 shadow-2xl shadow-emerald-950/10">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Sign in to Chezcar</CardTitle>
          <p className="text-sm text-slate-500">
            Use your assigned internal account to continue.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={isSubmitting}
            type="submit"
          >
            {(isSubmitting || credentialPhase === "checking") && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {credentialPhase === "checking" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>

      <CredentialSetupDialog
        open={credentialPhase === "required"}
        onComplete={handleCredentialComplete}
      />
    </Card>
  );
}
