"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProductOption = { id: string; itemCode: string; name: string };
type ReceiptLine = { id: number; productId: string; quantity: string };

export function ReceiveStockForm({ products }: { products: readonly ProductOption[] }) {
  const [reference, setReference] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([{ id: 1, productId: "", quantity: "" }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const totalQuantity = lines.reduce((total, line) => total + Number(line.quantity || 0), 0);

  function updateLine(id: number, field: "productId" | "quantity", value: string) {
    setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  }

  async function submit() {
    setMessage(null);
    const payload = {
      reference,
      supplier,
      notes: notes || undefined,
      lines: lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
    };
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stock-receipts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { data?: { reference: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to post supplier receipt");
      setMessage({ kind: "success", text: `Receipt ${body.data?.reference ?? reference} posted to Stock Room.` });
      setReference("");
      setSupplier("");
      setNotes("");
      setLines([{ id: Date.now(), productId: "", quantity: "" }]);
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to post supplier receipt" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell title="Receive From Supplier" subtitle="Post an auditable supplier receipt directly into Stock Room. Branch receiving is not supported.">
      <div className="mb-6 flex justify-end"><Link href="/inventory"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to Inventory</Button></Link></div>
      {message && <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card><CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <div className="space-y-2"><Label>Receive To</Label><Input value="Stock Room (SR)" disabled /></div>
            <div className="space-y-2"><Label htmlFor="receipt-reference">Receipt / Reference</Label><Input id="receipt-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="DR-000123" required /></div>
            <div className="space-y-2"><Label htmlFor="receipt-supplier">Supplier / Source</Label><Input id="receipt-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier name" required /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="receipt-notes">Notes</Label><textarea id="receipt-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" maxLength={4000} placeholder="Optional delivery notes" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">Receipt Lines</h2><p className="text-sm text-slate-500">Each active product can be received once with a positive quantity.</p></div><Button type="button" variant="outline" onClick={() => setLines((current) => [...current, { id: Date.now(), productId: "", quantity: "" }])}><Plus className="mr-2 h-4 w-4" />Add line</Button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px]"><thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Product</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Quantity</th><th className="px-5 py-3" /></tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-t"><td className="px-5 py-3"><select value={line.productId} onChange={(event) => updateLine(line.id, "productId", event.target.value)} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Select active product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.itemCode} - {product.name}</option>)}</select></td><td className="px-5 py-3"><Input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", event.target.value)} /></td><td className="px-5 py-3"><Button type="button" variant="outline" size="sm" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table></div>
          </CardContent></Card>
        </div>
        <Card className="h-fit"><CardContent className="space-y-4 p-5"><h2 className="font-semibold">Posting Summary</h2><div className="flex justify-between text-sm"><span className="text-slate-500">Destination</span><strong>Stock Room (SR)</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">Lines</span><strong>{lines.length}</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">Total quantity</span><strong>{totalQuantity}</strong></div><p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Posting increases SR balances and writes a receipt and inventory movement in one transaction.</p><Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={isSubmitting} onClick={submit}>{isSubmitting ? "Posting..." : "Post Supplier Receipt"}</Button></CardContent></Card>
      </div>
    </PageShell>
  );
}
