"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CapabilityId } from "@/lib/contracts/roles";
import { getOfflineDeviceId } from "@/lib/offline-sales-client";

export type OfflineBranchOption = {
  id: string;
  code: string;
  name: string;
};

type ActivationResponse = {
  data?: { location: OfflineBranchOption; expiresAt: string };
  error?: { message?: string };
};

function formatExpiry(value: string) {
  return new Date(value).toLocaleString();
}

export function OfflineDevicesClient({
  branches,
  capabilities,
}: {
  branches: OfflineBranchOption[];
  capabilities: ReadonlyArray<CapabilityId>;
}) {
  const canActivate = capabilities.includes("offline-sales:activate-device");
  const [deviceId, setDeviceId] = useState("");
  const [locationId, setLocationId] = useState(branches[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activation, setActivation] = useState<ActivationResponse["data"]>();

  useEffect(() => {
    // The device ID only exists in browser storage; load it after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeviceId(getOfflineDeviceId());
  }, []);

  const copyDeviceId = async () => {
    if (!deviceId) return;
    await navigator.clipboard.writeText(deviceId);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  };

  const activate = async () => {
    if (!canActivate) return;
    setError("");
    setMessage("");
    setActivation(undefined);
    if (!locationId || !deviceId) {
      setError("Select a branch and wait for the device ID to load.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/offline/activations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, deviceId, label: label.trim() || undefined }),
      });
      const json = (await response.json().catch(() => null)) as ActivationResponse | null;
      if (!response.ok) throw new Error(json?.error?.message ?? "Unable to activate device");
      setActivation(json?.data);
      setMessage("Device activated. Open POS on this device while online to download its branch snapshot.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to activate device");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageShell title="Offline Devices" subtitle="Authorize a branch POS device to continue direct sales during an internet outage.">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600" />Activate branch device</CardTitle>
            <CardDescription>Activation lasts 24 hours and only applies to the selected branch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="offline-branch">Branch</Label>
              <select id="offline-branch" value={locationId} onChange={(event) => setLocationId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Select branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offline-device-id">This browser device ID</Label>
              <div className="flex gap-2">
                <Input id="offline-device-id" value={deviceId} readOnly placeholder="Loading device ID..." className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={() => void copyDeviceId()} disabled={!deviceId} aria-label="Copy device ID">
                  {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">For testing, activate this browser, then use the same browser to sign in as Branch Staff.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offline-device-label">Device label (optional)</Label>
              <Input id="offline-device-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="QC front counter" maxLength={100} />
            </div>

            {error ? <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
            {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}

            {canActivate ? (
              <Button type="button" onClick={() => void activate()} disabled={isSubmitting || !deviceId || !locationId} className="w-full">
                {isSubmitting ? <><Loader2 className="mr-2 size-4 animate-spin" />Activating...</> : "Activate device"}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="h-fit border-amber-200 bg-amber-50/60">
          <CardHeader>
            <CardTitle>What happens next?</CardTitle>
            <CardDescription>Activation does not replace normal account access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-700">
            <p>1. Sign in as the Branch Staff account assigned to the selected branch.</p>
            <p>2. Open Customer Sales while online so the product and stock snapshot is cached.</p>
            <p>3. If internet fails, direct sales are stored locally and uploaded automatically when the server is reachable again.</p>
            {activation ? <div className="rounded-lg border border-emerald-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="font-semibold">Active authorization</span><Badge className="bg-emerald-100 text-emerald-700">Active</Badge></div><p className="mt-2 text-xs text-slate-500">{activation.location.name} ({activation.location.code})</p><p className="mt-1 text-xs text-slate-500">Expires {formatExpiry(activation.expiresAt)}</p></div> : null}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
