"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import Select, { type StylesConfig } from "react-select";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BackjobOptionDto } from "@/lib/contracts/backjobs";

type SaleOption = BackjobOptionDto["sales"][number];

const saleSelectStyles: StylesConfig<SaleOption, false> = {
  control: (base, state) => ({ ...base, minHeight: "36px", backgroundColor: "var(--background)", borderColor: state.isFocused ? "var(--ring)" : "var(--input)", boxShadow: "none" }),
  input: (base) => ({ ...base, color: "var(--foreground)" }),
  singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
  placeholder: (base) => ({ ...base, color: "var(--muted-foreground)" }),
  menu: (base) => ({ ...base, zIndex: 50, backgroundColor: "var(--popover)" }),
  option: (base, state) => ({ ...base, color: state.isSelected ? "var(--primary-foreground)" : "var(--popover-foreground)", backgroundColor: state.isSelected ? "var(--primary)" : state.isFocused ? "var(--accent)" : "var(--popover)" }),
};

export function NewBackjobClient({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const [legacy, setLegacy] = useState(false);
  const [saleId, setSaleId] = useState("");
  const [lineIds, setLineIds] = useState<string[]>([]);
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
    event.preventDefault();
    if (saving) return;
    setError("");
    if (!legacy && (!sale || !lineIds.length || !lineIds.every((id) => sale.lines.some((line) => line.id === id)))) {
      setError("Select a posted sale and at least one affected purchased item.");
      return;
    }
    setSaving(true);
    const payload = legacy ? { isLegacy: true, locationId, customerId, legacyReference, legacyReason, legacyProductDescription, concern } : { isLegacy: false, saleId, saleLineIds: lineIds, concern };
    try {
      const response = await fetch("/api/backjobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to create Backjob");
      router.push(`/inventory/returns-warranty/${body.data.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create Backjob");
    } finally {
      setSaving(false);
    }
  }

  return <PageShell title="New Backjob" subtitle="Open for purchased items from one posted sale with a recorded customer">
    <Card className="max-w-3xl"><CardHeader><CardTitle>Source and concern</CardTitle></CardHeader><CardContent>
      {isOwner ? <label className="mb-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} onChange={(event) => setLegacy(event.target.checked)} />Legacy record without a posted original sale</label> : null}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        {!legacy ? <>
          <Field label="Posted sale" htmlFor="backjob-sale"><Select<SaleOption>
            inputId="backjob-sale"
            instanceId="backjob-sale"
            name="saleId"
            required
            isSearchable
            isClearable
            isLoading={options.isLoading}
            isDisabled={options.isLoading || options.isError || saving}
            options={options.data?.sales ?? []}
            value={sale ?? null}
            getOptionValue={(item) => item.id}
            getOptionLabel={(item) => `${item.receiptNumber} · ${item.customerName}`}
            filterOption={(option, search) => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())}
            onChange={(item) => { setSaleId(item?.id ?? ""); setLineIds(item?.lines.length === 1 ? [item.lines[0].id] : []); }}
            placeholder="Search receipt or customer"
            noOptionsMessage={() => "No matching posted sales"}
            styles={saleSelectStyles}
            className="min-w-0 text-sm"
          /></Field>
          <fieldset id="backjob-items" disabled={!sale || saving} className="grid min-w-0 content-start gap-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Affected purchased items</legend>
            {!sale || !sale.lines.length ? <p className="text-sm text-muted-foreground">{!sale ? "Select a sale first" : "No items on this sale"}</p> : <div className="grid max-h-64 gap-2 overflow-y-auto">{sale.lines.map((line) => <label key={line.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={lineIds.includes(line.id)} disabled={!lineIds.includes(line.id) && lineIds.length >= 100} onChange={(event) => setLineIds((current) => event.target.checked ? [...current, line.id] : current.filter((id) => id !== line.id))} /><span className="min-w-0 break-words">{line.itemCode} · {line.name}</span></label>)}</div>}
            <p className="text-xs text-muted-foreground">{lineIds.length} selected</p>
          </fieldset>
          <p className="text-sm text-muted-foreground sm:col-span-2">Select one or more purchased items from the same receipt. They share one Backjob, concern, schedule, and parts plan.</p>
        </> : <>
          <Field label="Branch"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Select branch</option>{options.data?.locations.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field>
          <Field label="Customer"><select required className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{options.data?.customers.map((item) => <option key={item.id} value={item.id}>{item.name}{item.mobile ? ` · ${item.mobile}` : ""}</option>)}</select></Field>
          <Field label="Legacy reference"><Input required value={legacyReference} onChange={(event) => setLegacyReference(event.target.value)} /></Field>
          <Field label="Product description"><Input required value={legacyProductDescription} onChange={(event) => setLegacyProductDescription(event.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Reason original sale is unavailable"><Textarea required value={legacyReason} onChange={(event) => setLegacyReason(event.target.value)} /></Field></div>
        </>}
        <div className="sm:col-span-2"><Field label="Customer concern"><Textarea required value={concern} onChange={(event) => setConcern(event.target.value)} /></Field></div>
        {options.isError ? <div role="alert" className="text-sm text-destructive sm:col-span-2">{options.error.message} <Button type="button" variant="outline" onClick={() => void options.refetch()}><RefreshCw aria-hidden="true" />Retry options</Button></div> : null}
        {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2"><Button type="submit" disabled={saving || options.isLoading || options.isError}><Plus aria-hidden="true" />{saving ? "Creating..." : "Create draft"}</Button></div>
      </form>
    </CardContent></Card>
  </PageShell>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) { return <div className="grid min-w-0 gap-1.5"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>; }
