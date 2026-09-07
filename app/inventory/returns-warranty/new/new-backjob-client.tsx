"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BackjobOptionDto } from "@/lib/contracts/backjobs";

export function NewBackjobClient({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const [legacy, setLegacy] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [lineId, setLineId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [concern, setConcern] = useState("");
  const [legacyReference, setLegacyReference] = useState("");
  const [legacyReason, setLegacyReason] = useState("");
  const [legacyProductDescription, setLegacyProductDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const options = useQuery({ queryKey: ["backjob-options"], queryFn: async () => { const response = await fetch("/api/backjobs/options"); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Unable to load options"); return body.data as BackjobOptionDto; } });
  const sale = options.data?.sales.find((item) => item.id === saleId);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = legacy ? { isLegacy: true, locationId, customerId, legacyReference, legacyReason, legacyProductDescription, concern } : { isLegacy: false, saleId, saleLineId: lineId, concern };
    const response = await fetch("/api/backjobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setSaving(false);
    if (!response.ok) return setError(body.error?.message ?? "Unable to create Backjob");
    router.push(`/inventory/returns-warranty/${body.data.id}`);
  }

  return <PageShell title="New Backjob" subtitle="Open from a posted sale line with a recorded customer">
    <Card className="max-w-3xl"><CardHeader><CardTitle>Source and concern</CardTitle></CardHeader><CardContent>
      {isOwner ? <label className="mb-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} onChange={(event) => setLegacy(event.target.checked)} />Legacy record without a posted original sale</label> : null}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {!legacy ? <>
          <Field label="Posted sale"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={saleId} onChange={(event) => { setSaleId(event.target.value); setLineId(""); }}><option value="">Select sale</option>{options.data?.sales.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.customerName} · receipt {item.receiptNumber}</option>)}</select></Field>
          <Field label="Affected sale line"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={lineId} onChange={(event) => setLineId(event.target.value)}><option value="">Select item</option>{sale?.lines.map((line) => <option key={line.id} value={line.id}>{line.itemCode} · {line.name}</option>)}</select></Field>
        </> : <>
          <Field label="Branch"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Select branch</option>{options.data?.locations.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field>
          <Field label="Customer"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{options.data?.customers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.mobile ? ` · ${item.mobile}` : ""}</option>)}</select></Field>
          <Field label="Legacy reference"><Input required value={legacyReference} onChange={(event) => setLegacyReference(event.target.value)} /></Field>
          <Field label="Product description"><Input required value={legacyProductDescription} onChange={(event) => setLegacyProductDescription(event.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Reason original sale is unavailable"><Textarea required value={legacyReason} onChange={(event) => setLegacyReason(event.target.value)} /></Field></div>
        </>}
        <div className="sm:col-span-2"><Field label="Customer concern"><Textarea required value={concern} onChange={(event) => setConcern(event.target.value)} /></Field></div>
        {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2"><Button disabled={saving || options.isLoading}>{saving ? "Creating..." : "Create draft"}</Button></div>
      </form>
    </CardContent></Card>
  </PageShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
