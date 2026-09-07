"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import ReactSelect from "react-select";
import type {
  GroupBase,
  Props as ReactSelectProps,
  StylesConfig,
} from "react-select";

import { PageShell } from "@/components/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { postStockReceiptAction, type ReceiptFormState } from "./actions";
import type { SupplierOptionDto } from "@/lib/contracts/suppliers";

type ProductOption = { id: string; itemCode: string; name: string };
type SelectOption = { value: string; label: string };
type ReceiptLine = { id: number; productId: string; expected: number; accepted: number };

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "40px",
    backgroundColor: "var(--background)",
    borderColor: state.isFocused ? "var(--ring)" : "var(--input)",
    boxShadow: "none",
    "&:hover": { borderColor: "var(--ring)" },
  }),
  input: (base) => ({ ...base, color: "var(--foreground)" }),
  singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
  placeholder: (base) => ({ ...base, color: "var(--muted-foreground)" }),
  menu: (base) => ({ ...base, backgroundColor: "var(--popover)", zIndex: 50 }),
  menuPortal: (base) => ({ ...base, zIndex: 100 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--primary)"
      : state.isFocused
        ? "var(--muted)"
        : "var(--popover)",
    color: state.isSelected ? "var(--primary-foreground)" : "var(--popover-foreground)",
    cursor: "pointer",
  }),
};

function Select<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(props: ReactSelectProps<Option, IsMulti, Group>) {
  return (
    <ReactSelect<Option, IsMulti, Group>
      {...props}
      menuPortalTarget={
        typeof document === "undefined" ? undefined : document.body
      }
      menuPosition="fixed"
    />
  );
}

export function ReceiveStockForm({
  products,
  suppliers,
}: {
  products: readonly ProductOption[];
  suppliers: readonly SupplierOptionDto[];
}) {
  const [state, formAction, isPending] = useActionState<ReceiptFormState, FormData>(postStockReceiptAction, null);
  const [lines, setLines] = useState<ReceiptLine[]>([{ id: 1, productId: "", expected: 1, accepted: 1 }]);
  const [supplierId, setSupplierId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.itemCode} - ${product.name}`,
  }));
  const supplierOptions = suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name,
  }));

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // The server action completed; clear the client-side line editor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([{ id: Date.now(), productId: "", expected: 1, accepted: 1 }]);
      setSupplierId("");
    }
  }, [state]);

  return (
    <PageShell title="Receive From Supplier" subtitle="Post an auditable supplier receipt directly into Stock Room. Branch receiving is not supported.">
      <div className="mb-6 flex justify-end"><Link href="/inventory" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="mr-2 h-4 w-4" />Back to Inventory</Link></div>
      {state && <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{state.message}</div>}
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="lineCount" value={lines.length} />
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2"><Label>Receive To</Label><Input value="Stock Room (SR)" disabled /></div>
              <div className="space-y-2"><Label htmlFor="receipt-reference">Receipt / Reference</Label><Input id="receipt-reference" name="reference" placeholder="DR-000123" required /></div>
              <div className="space-y-2"><Label htmlFor="receipt-supplier">Supplier</Label><input type="hidden" name="supplierId" value={supplierId} /><Select<SelectOption, false> instanceId="receipt-supplier" inputId="receipt-supplier" aria-label="Supplier" options={supplierOptions} value={supplierOptions.find((option) => option.value === supplierId) ?? null} onChange={(option) => setSupplierId(option?.value ?? "")} isSearchable placeholder="Select active supplier" noOptionsMessage={() => "No active suppliers available"} styles={selectStyles} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="receipt-notes">Notes</Label><textarea id="receipt-notes" name="notes" className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" maxLength={4000} placeholder="Optional delivery notes" /></div>
            </CardContent></Card>
            <Card className="min-w-0"><CardContent className="min-w-0 p-0">
               <div className="flex flex-col items-start gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Receipt Lines</h2><p className="text-sm text-slate-500">Expected must equal accepted + quarantined + missing. Affected lines create a draft Supplier Damage claim.</p></div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: Date.now(), productId: "", expected: 1, accepted: 1 }])}><Plus className="mr-2 h-4 w-4" />Add line</Button></div>
               <div className="overflow-x-auto"><table className="w-full min-w-[1180px]"><thead className="bg-slate-50"><tr><th className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">Product</th>{["Expected", "Accepted", "Quarantine", "Missing", "Unit Cost", "Claim reason", "Claim notes"].map((label) => <th key={label} className="px-3 py-3 text-left text-xs font-semibold uppercase text-slate-500">{label}</th>)}<th /></tr></thead><tbody>{lines.map((line, index) => <tr key={line.id} className="border-t"><td className="min-w-72 px-3 py-3"><input type="hidden" name={`productId-${index}`} value={line.productId} /><Select<SelectOption, false> instanceId={`receive-product-${line.id}`} inputId={`receive-product-${line.id}`} aria-label={`Product for receipt line ${index + 1}`} options={productOptions} value={productOptions.find((option) => option.value === line.productId) ?? null} onChange={(option) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, productId: option?.value ?? "" } : item))} isSearchable placeholder="Select product" styles={selectStyles} /></td><td className="w-24 px-3"><Input type="number" name={`expectedQuantity-${index}`} min="1" step="1" value={line.expected} onChange={(event) => { const expected = Number(event.target.value); setLines((current) => current.map((item) => item.id === line.id ? { ...item, expected, accepted: expected } : item)); }} /></td><td className="w-24 px-3"><Input type="number" name={`acceptedQuantity-${index}`} min="0" step="1" value={line.accepted} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, accepted: Number(event.target.value) } : item))} /></td><td className="w-24 px-3"><Input type="number" name={`quarantinedQuantity-${index}`} min="0" step="1" defaultValue="0" /></td><td className="w-24 px-3"><Input type="number" name={`missingQuantity-${index}`} min="0" step="1" defaultValue="0" /></td><td className="w-28 px-3"><Input type="number" name={`unitCost-${index}`} min="0.01" step="0.01" required /></td><td className="w-40 px-3"><select name={`claimReason-${index}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm"><option value="">None</option><option value="DAMAGE">Damage</option><option value="DEFECT">Defect</option><option value="INCOMPLETE">Incomplete</option><option value="WRONG_ITEM">Wrong item</option></select></td><td className="min-w-40 px-3"><Input name={`claimNotes-${index}`} maxLength={1000} /></td><td className="px-3"><Button type="button" variant="destructive" size="sm" aria-label={`Remove receipt line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>
            </CardContent></Card>
          </div>
          <Card className="h-fit"><CardContent className="space-y-4 p-5"><h2 className="font-semibold">Posting Summary</h2><div className="flex justify-between text-sm"><span className="text-slate-500">Destination</span><strong>Stock Room (SR)</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">Lines</span><strong>{lines.length}</strong></div>{suppliers.length === 0 ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">No active suppliers are available.</p> : <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Accepted and quarantined units increase on hand; only quarantined units increase quarantine. Missing units do not affect stock.</p>}<Button type="submit" variant="workflow" className="w-full" disabled={isPending || !supplierId}>{isPending ? "Posting..." : "Post Supplier Receipt"}</Button></CardContent></Card>
        </div>
      </form>
    </PageShell>
  );
}
