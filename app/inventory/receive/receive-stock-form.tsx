"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Select from "react-select";
import type { StylesConfig } from "react-select";

import { PageShell } from "@/components/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { postStockReceiptAction, type ReceiptFormState } from "./actions";

type ProductOption = { id: string; itemCode: string; name: string };
type ProductSelectOption = { value: string; label: string };
type ReceiptLine = { id: number; productId: string };

const productSelectStyles: StylesConfig<ProductSelectOption, false> = {
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

export function ReceiveStockForm({ products }: { products: readonly ProductOption[] }) {
  const [state, formAction, isPending] = useActionState<ReceiptFormState, FormData>(postStockReceiptAction, null);
  const [lines, setLines] = useState<ReceiptLine[]>([{ id: 1, productId: "" }]);
  const formRef = useRef<HTMLFormElement>(null);
  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.itemCode} - ${product.name}`,
  }));

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // The server action completed; clear the client-side line editor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLines([{ id: Date.now(), productId: "" }]);
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
              <div className="space-y-2"><Label htmlFor="receipt-supplier">Supplier / Source</Label><Input id="receipt-supplier" name="supplier" placeholder="Supplier name" required /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="receipt-notes">Notes</Label><textarea id="receipt-notes" name="notes" className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" maxLength={4000} placeholder="Optional delivery notes" /></div>
            </CardContent></Card>
            <Card className="min-w-0"><CardContent className="min-w-0 p-0">
              <div className="flex flex-col items-start gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">Receipt Lines</h2><p className="text-sm text-slate-500">Each active product can be received once with a positive quantity and supplier unit cost.</p></div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: Date.now(), productId: "" }])}><Plus className="mr-2 h-4 w-4" />Add line</Button></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Product</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Quantity</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Unit Cost</th><th className="px-5 py-3" /></tr></thead><tbody>{lines.map((line, index) => <tr key={line.id} className="border-t"><td className="px-5 py-3"><input type="hidden" name={`productId-${index}`} value={line.productId} /><Select<ProductSelectOption, false> instanceId={`receive-product-${line.id}`} inputId={`receive-product-${line.id}`} aria-label={`Product for receipt line ${index + 1}`} options={productOptions} value={productOptions.find((option) => option.value === line.productId) ?? null} onChange={(option) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, productId: option?.value ?? "" } : item))} isSearchable placeholder="Select active product" noOptionsMessage={() => "No active products found"} styles={productSelectStyles} /></td><td className="px-5 py-3"><Input type="number" name={`quantity-${index}`} min="1" step="1" defaultValue="1" /></td><td className="px-5 py-3"><Input type="number" name={`unitCost-${index}`} min="0.01" step="0.01" placeholder="0.00" required /></td><td className="px-5 py-3"><Button type="button" variant="destructive" size="sm" aria-label={`Remove receipt line ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>
            </CardContent></Card>
          </div>
          <Card className="h-fit"><CardContent className="space-y-4 p-5"><h2 className="font-semibold">Posting Summary</h2><div className="flex justify-between text-sm"><span className="text-slate-500">Destination</span><strong>Stock Room (SR)</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">Lines</span><strong>{lines.length}</strong></div><p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Posting increases SR balances and writes a receipt and inventory movement in one transaction.</p><Button type="submit" variant="workflow" className="w-full" disabled={isPending}>{isPending ? "Posting..." : "Post Supplier Receipt"}</Button></CardContent></Card>
        </div>
      </form>
    </PageShell>
  );
}
