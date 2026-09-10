"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import Select, { type StylesConfig } from "react-select";

import { PageShell } from "@/components/page-shell";
import { ClaimEvidenceInput } from "@/components/claim-evidence-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Options = { locations: Array<{ id: string; code: string; name: string }>; lines: Array<{ id: string; quantity: number; productItemCode: string; productName: string; warrantyDurationMonths: number | null; warrantyExpiresAt: string | null; sale: { manualReceiptNumber: string; locationId: string; customer: { name: string } | null } }>; products: Array<{ id: string; itemCode: string; name: string }>; legacyAllowed: boolean };
type PurchasedItemOption = Options["lines"][number];

const purchasedItemStyles: StylesConfig<PurchasedItemOption, false> = {
  control: (base, state) => ({ ...base, minHeight: "36px", backgroundColor: "var(--background)", borderColor: state.isFocused ? "var(--ring)" : "var(--input)", boxShadow: "none" }),
  input: (base) => ({ ...base, color: "var(--foreground)" }),
  singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
  placeholder: (base) => ({ ...base, color: "var(--muted-foreground)" }),
  menu: (base) => ({ ...base, zIndex: 50, backgroundColor: "var(--popover)" }),
  option: (base, state) => ({ ...base, color: state.isSelected ? "var(--primary-foreground)" : "var(--popover-foreground)", backgroundColor: state.isSelected ? "var(--primary)" : state.isFocused ? "var(--accent)" : "var(--popover)" }),
};

export function WarrantyCreateClient({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [legacy, setLegacy] = useState(false);
  const [saleLineId, setSaleLineId] = useState("");
  const [claimQuantity, setClaimQuantity] = useState("1");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const options = useQuery({ queryKey: ["customer-warranty-options"], queryFn: async () => { const response = await fetch("/api/customer-warranties/options"); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load options"); return json.data as Options; } });
  const selectedLine = options.data?.lines.find((line) => line.id === saleLineId);
  const saleLocation = options.data?.locations.find((location) => location.id === selectedLine?.sale.locationId);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const formElement = event.currentTarget;
    setSubmitting(true); setError("");
    try {
      const form = new FormData(formElement);
      if (!legacy) {
        if (!selectedLine) throw new Error("Select a purchased item from a verified customer sale.");
        if (!saleLocation) throw new Error("The original sale location is inactive or unavailable to you. Reload the form or ask the owner to check the location and your access.");
        form.set("saleLineId", selectedLine.id);
        form.set("locationId", selectedLine.sale.locationId);
      }
      form.set("idempotencyKey", idempotencyKey.current);
      if (!photo) form.delete("photo");
      const response = await fetch("/api/customer-warranties", { method: "POST", body: form });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Unable to create the claim. Please try again.");
      if (!json?.data?.id) throw new Error("The server did not confirm the claim. Retry without changing the details to avoid a duplicate.");
      router.push(`/inventory/returns-warranty/warranties/${json.data.id}`);
    } catch (caught) {
      setError(caught instanceof TypeError ? "Could not reach the server. Check your connection and retry with the same details." : caught instanceof Error ? caught.message : "Unable to create the claim. Please try again.");
      setSubmitting(false);
    }
  }
  const needsWarrantyBasis = legacy || selectedLine?.warrantyDurationMonths === null;
  const mayNeedQuantityOverride = !legacy && selectedLine && Number(claimQuantity) > selectedLine.quantity;
  return <PageShell title="Create warranty claim" subtitle="Record the customer's issue first. Stock changes only when you separately confirm that the item was received."><Card className="max-w-3xl"><CardContent className="pt-6">
    <p className="mb-5 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">Select the verified purchased item first. The customer, product, and branch will be filled automatically. Creating this claim does not yet receive the item into inventory.</p>
    {options.error ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{options.error.message}</p><Button type="button" variant="outline" onClick={() => options.refetch()}><RefreshCw aria-hidden="true" />Retry loading</Button></div> : <form className="grid gap-5 md:grid-cols-2" onSubmit={submit}><fieldset disabled={submitting || options.isLoading} className="contents">
      <div className="space-y-2 md:col-span-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} disabled={!options.data?.legacyAllowed} onChange={(event) => { setLegacy(event.target.checked); setError(""); }} /> Sale not recorded in this system (owner only)</label></div>
      {!legacy ? <div className="grid min-w-0 gap-2 md:col-span-2">
        <Label htmlFor="saleLineId">Purchased item</Label>
        <Select<PurchasedItemOption>
          inputId="saleLineId"
          instanceId="warranty-purchased-item"
          name="saleLineId"
          required
          isSearchable
          isClearable
          isLoading={options.isLoading}
          isDisabled={submitting || options.isLoading}
          options={options.data?.lines ?? []}
          value={selectedLine ?? null}
          getOptionValue={(line) => line.id}
          getOptionLabel={(line) => `${line.sale.manualReceiptNumber} - ${line.sale.customer?.name ?? "Unknown customer"}`}
          formatOptionLabel={(line, { context }) => <div className="min-w-0 break-words"><div>{line.sale.manualReceiptNumber} - {line.sale.customer?.name ?? "Unknown customer"}</div>{context === "menu" ? <div className="text-xs">Affected product: {line.productItemCode} - {line.productName} (Purchased: {line.quantity})</div> : null}</div>}
          filterOption={({ label, data }, search) => `${label} ${data.productItemCode} ${data.productName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())}
          onChange={(line) => { setSaleLineId(line?.id ?? ""); setError(""); }}
          placeholder="Search receipt, customer, or product"
          noOptionsMessage={() => "No matching purchased items"}
           styles={purchasedItemStyles}
          className="min-w-0 text-sm"
        />
         {selectedLine ? <p id="affected-product" className="break-words text-sm"><span className="font-medium">Affected product:</span> {selectedLine.productItemCode} - {selectedLine.productName} (Purchased: {selectedLine.quantity})</p> : null}
         {options.data && options.data.lines.length === 0 ? <p className="text-sm text-muted-foreground">No verified purchased items found.</p> : null}
       </div> : <><div className="grid gap-2"><Label htmlFor="legacyCustomerName">Customer name</Label><Input id="legacyCustomerName" name="legacyCustomerName" required /></div><div className="grid gap-2"><Label htmlFor="productId">Product</Label><select id="productId" name="productId" required className="h-9 rounded-md border bg-background px-3"><option value="">Select product</option>{options.data?.products.map((item) => <option key={item.id} value={item.id}>{item.itemCode} - {item.name}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="legacySaleReference">Original receipt or sale reference (optional)</Label><Input id="legacySaleReference" name="legacySaleReference" /></div><div className="grid gap-2"><Label htmlFor="legacyReason">Why is there no system sale?</Label><Input id="legacyReason" name="legacyReason" required /></div></>}
      <div className="grid min-w-0 gap-2"><Label htmlFor="locationId">{legacy ? "Case / intake branch" : "Branch handling this warranty"}</Label>{legacy ? <select id="locationId" name="locationId" required className="h-9 min-w-0 rounded-md border bg-background px-3"><option value="">Select branch</option>{options.data?.locations.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select> : <Input id="locationId" readOnly value={saleLocation ? `${saleLocation.code} - ${saleLocation.name}` : ""} placeholder="Select a purchased item first" />}{!legacy && selectedLine && !saleLocation ? <p role="alert" className="text-sm text-destructive">Original sale branch is unavailable.</p> : null}</div>
      <div className="grid gap-2"><Label htmlFor="claimQuantity">Quantity</Label><Input id="claimQuantity" name="claimQuantity" type="number" min="1" value={claimQuantity} onChange={(event) => setClaimQuantity(event.target.value)} required /></div>
       {needsWarrantyBasis && isOwner ? <><div className="grid gap-2"><Label htmlFor="warrantyBasisMonths">Warranty period for this claim (months)</Label><Input id="warrantyBasisMonths" name="warrantyBasisMonths" type="number" min="1" max="1200" required /></div><div className="grid gap-2"><Label htmlFor="warrantyBasisReason">Warranty coverage basis</Label><Input id="warrantyBasisReason" name="warrantyBasisReason" placeholder="e.g. Original invoice or supplier warranty" required /></div></> : null}
      {needsWarrantyBasis && !isOwner ? <p className="text-sm text-destructive md:col-span-2">No warranty period was saved with this sale. Ask the owner to create the claim and explain the coverage.</p> : null}
      {isOwner ? <div className="grid gap-2 md:col-span-2"><Label htmlFor="quantityOverrideReason">Reason for claiming more than purchased</Label><Input id="quantityOverrideReason" name="quantityOverrideReason" required={Boolean(mayNeedQuantityOverride)} aria-describedby="quantity-help" /><p id="quantity-help" className="text-sm text-muted-foreground">Required only if this claim plus earlier claims exceeds the purchased quantity. Only the owner can allow this exception.</p></div> : null}
      {mayNeedQuantityOverride && !isOwner ? <p className="text-sm text-destructive md:col-span-2">Claim quantity exceeds the purchased quantity. Ask the owner to record this exception with a reason.</p> : null}
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="concern">What is wrong with the item?</Label><Textarea id="concern" name="concern" required /></div>
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="photo">Intake photo (optional)</Label><ClaimEvidenceInput id="photo" name="photo" file={photo} onChange={setPhoto} accept="image/jpeg,image/png,image/webp" disabled={submitting} describedBy="photo-help" /><p id="photo-help" className="text-sm text-muted-foreground">JPEG, PNG, or WebP, up to 6 MB. You can create the claim without a photo. Remove only clears the file selected here.</p></div>
      {error ? <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p> : null}<div className="md:col-span-2"><Button type="submit" disabled={submitting || options.isLoading || (!legacy && (!selectedLine || !saleLocation)) || (needsWarrantyBasis && !isOwner) || (Boolean(mayNeedQuantityOverride) && !isOwner)}><Plus aria-hidden="true" />{submitting ? "Creating..." : "Create warranty claim"}</Button></div>
    </fieldset></form>}
  </CardContent></Card></PageShell>;
}
