"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Options = { locations: Array<{ id: string; code: string; name: string }>; lines: Array<{ id: string; quantity: number; productItemCode: string; productName: string; sale: { reference: string; manualReceiptNumber: string; locationId: string; customer: { name: string } | null } }>; products: Array<{ id: string; itemCode: string; name: string }>; legacyAllowed: boolean };

export function WarrantyCreateClient() {
  const router = useRouter();
  const [legacy, setLegacy] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const options = useQuery({ queryKey: ["customer-warranty-options"], queryFn: async () => { const response = await fetch("/api/customer-warranties/options"); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load options"); return json.data as Options; } });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    const form = new FormData(event.currentTarget); form.set("idempotencyKey", crypto.randomUUID());
    try { const response = await fetch("/api/customer-warranties", { method: "POST", body: form }); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to create warranty"); router.push(`/inventory/returns-warranty/warranties/${json.data.id}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create warranty"); setSubmitting(false); }
  }
  return <PageShell title="Receive warranty item" subtitle="The item is added to on-hand quarantine when this claim is recorded."><Card className="max-w-3xl"><CardContent className="pt-6">
    {options.error ? <p className="text-sm text-destructive">{options.error.message}</p> : <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}>
      <label className="md:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} disabled={!options.data?.legacyAllowed} onChange={(event) => setLegacy(event.target.checked)} /> Legacy claim (owner only)</label>
      <div className="grid gap-2"><Label htmlFor="locationId">Location</Label><select id="locationId" name="locationId" required className="h-9 rounded-md border bg-background px-3"><option value="">Select location</option>{options.data?.locations.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></div>
      <div className="grid gap-2"><Label htmlFor="claimQuantity">Quantity</Label><Input id="claimQuantity" name="claimQuantity" type="number" min="1" defaultValue="1" required /></div>
      {legacy ? <><div className="grid gap-2"><Label htmlFor="legacyCustomerName">Customer name</Label><Input id="legacyCustomerName" name="legacyCustomerName" required /></div><div className="grid gap-2"><Label htmlFor="productId">Product</Label><select id="productId" name="productId" required className="h-9 rounded-md border bg-background px-3"><option value="">Select product</option>{options.data?.products.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.name}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="legacySaleReference">Legacy sale reference</Label><Input id="legacySaleReference" name="legacySaleReference" /></div><div className="grid gap-2"><Label htmlFor="legacyReason">Legacy reason</Label><Input id="legacyReason" name="legacyReason" required /></div></> : <div className="grid gap-2 md:col-span-2"><Label htmlFor="saleLineId">Verified sale line</Label><select id="saleLineId" name="saleLineId" required className="h-9 rounded-md border bg-background px-3"><option value="">Select sale line</option>{options.data?.lines.map((line) => <option key={line.id} value={line.id}>{line.sale.reference} / {line.sale.customer?.name} / {line.productItemCode} - {line.productName} ({line.quantity})</option>)}</select></div>}
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="concern">Concern</Label><Textarea id="concern" name="concern" required /></div>
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="photo">Required intake photo</Label><Input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}<div className="md:col-span-2"><Button disabled={submitting || options.isLoading}>{submitting ? "Receiving..." : "Receive into quarantine"}</Button></div>
    </form>}
  </CardContent></Card></PageShell>;
}
