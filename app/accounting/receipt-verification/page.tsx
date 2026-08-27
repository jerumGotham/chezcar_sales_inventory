"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { AlertTriangle, CheckCircle2, Loader2, Search, Upload } from "lucide-react";

import { useShellAccess } from "@/components/shell-access-context";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SaleLine = { itemCode: string; name: string; quantity: number; unitPrice: number };
type Sale = {
  id: string;
  reference: string;
  manualReceiptNumber: string;
  receiptBooklet: string;
  branch: string;
  customer: string;
  totalAmount: number;
  discountAmount: number;
  amountPaid: number;
  paymentMethod: string;
  postedAt: string;
  postedBy: string;
  reviewStatus: "UNVERIFIED" | "VERIFIED" | "MISMATCH_REPORTED";
  mismatchCategory: string | null;
  reviewNotes: string | null;
  receiptPhotoUrl: string | null;
  correctionOfId: string | null;
  resolutionAction: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  lines: SaleLine[];
};

type ComparisonDraft = {
  receiptBooklet: string;
  receiptNumber: string;
  paymentMethod: string;
  discountAmount: string;
  amountPaid: string;
  totalAmount: string;
  lines: Array<{ itemCode: string; quantity: string; unitPrice: string }>;
};

const MISMATCH_OPTIONS = [
  ["PRICE_MISMATCH", "Price mismatch"],
  ["QUANTITY_MISMATCH", "Quantity mismatch"],
  ["ITEM_MISMATCH", "Item mismatch"],
  ["TOTAL_MISMATCH", "Total mismatch"],
  ["RECEIPT_NOT_FOUND", "Receipt not found"],
  ["OTHER", "Other"],
] as const;

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

async function fetchReceipts() {
  const response = await fetch("/api/accounting/receipts", { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load receipts");
  return json.data as Sale[];
}

function toComparison(draft: ComparisonDraft) {
  return {
    receiptBooklet: draft.receiptBooklet,
    receiptNumber: draft.receiptNumber,
    paymentMethod: draft.paymentMethod,
    discountAmount: Number(draft.discountAmount),
    amountPaid: Number(draft.amountPaid),
    totalAmount: Number(draft.totalAmount),
    lines: draft.lines.map((line) => ({ itemCode: line.itemCode, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })),
  };
}

async function uploadPhoto(saleId: string, file: File | null, existingKey: string | null) {
  if (!file || existingKey) return existingKey;
  const formData = new FormData();
  formData.set("photo", file);
  const response = await fetch(`/api/accounting/receipts/${saleId}/photo`, { method: "POST", credentials: "same-origin", body: formData });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to upload receipt photo");
  return json.data.key as string;
}

function comparisonDifferences(sale: Sale, draft: ComparisonDraft) {
  const comparison = toComparison(draft);
  const differences: string[] = [];
  if (sale.manualReceiptNumber !== comparison.receiptNumber || sale.receiptBooklet !== comparison.receiptBooklet) differences.push("Receipt identity");
  if (sale.paymentMethod !== comparison.paymentMethod) differences.push("Payment method");
  if (sale.discountAmount !== comparison.discountAmount) differences.push("Discount");
  if (sale.amountPaid !== comparison.amountPaid) differences.push("Amount paid");
  if (sale.totalAmount !== comparison.totalAmount) differences.push("Total");
  const saleLines = new Map(sale.lines.map((line) => [line.itemCode, line]));
  const paperLines = new Map(comparison.lines.map((line) => [line.itemCode, line]));
  for (const [itemCode, line] of saleLines) {
    const paperLine = paperLines.get(itemCode);
    if (!paperLine || line.quantity !== paperLine.quantity || line.unitPrice !== paperLine.unitPrice) differences.push(`Line ${itemCode}`);
  }
  for (const itemCode of paperLines.keys()) if (!saleLines.has(itemCode)) differences.push(`Line ${itemCode}`);
  return [...new Set(differences)];
}

export default function ReceiptVerificationPage() {
  const access = useShellAccess();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState("PRICE_MISMATCH");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { data: sales = [], isLoading, error } = useQuery({ queryKey: ["accounting-receipts"], queryFn: fetchReceipts });

  const reviewMutation = useMutation({
    mutationFn: async (status: "VERIFIED" | "MISMATCH_REPORTED") => {
      if (!selectedId) throw new Error("Select a receipt first.");
      const nextPhotoKey = await uploadPhoto(selectedId, photoFile, photoKey);
      const response = await fetch(`/api/accounting/receipts/${selectedId}/review`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, mismatchCategory: status === "MISMATCH_REPORTED" ? category : undefined, notes: status === "MISMATCH_REPORTED" ? notes : undefined, comparison: toComparison(comparison), receiptPhotoKey: status === "MISMATCH_REPORTED" ? nextPhotoKey : undefined }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to update receipt review");
      return json.data;
    },
    onSuccess: () => {
      setSelectedId(null);
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoKey(null);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] });
    },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const resolveMutation = useMutation({
    mutationFn: async (action: "CONFIRMED_CORRECT" | "VOIDED_REPLACED") => {
      if (!selectedId) throw new Error("Select a receipt first.");
      if (!resolutionNote.trim()) throw new Error("Resolution note is required.");
      const nextPhotoKey = await uploadPhoto(selectedId, photoFile, photoKey);
      const response = await fetch(`/api/accounting/receipts/${selectedId}/resolve`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note: resolutionNote, replacement: action === "VOIDED_REPLACED" ? toComparison(comparison) : undefined, receiptPhotoKey: nextPhotoKey ?? undefined }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to resolve mismatch");
      return json.data;
    },
    onSuccess: () => { setSelectedId(null); setResolutionNote(""); setFormError(null); queryClient.invalidateQueries({ queryKey: ["accounting-receipts"] }); },
    onError: (mutationError) => setFormError((mutationError as Error).message),
  });

  const filteredSales = sales.filter((sale) => `${sale.manualReceiptNumber} ${sale.reference} ${sale.customer} ${sale.branch}`.toLowerCase().includes(search.toLowerCase()));
  const selectedSale = sales.find((sale) => sale.id === selectedId) ?? null;
  const canReview = access.identity?.role === "ACCOUNTING_STAFF";
  const canResolve = access.identity?.role === "ACCOUNTING_STAFF" || access.identity?.role === "ADMIN";

  const [comparison, setComparison] = useState<ComparisonDraft>({ receiptBooklet: "", receiptNumber: "", paymentMethod: "CASH", discountAmount: "0", amountPaid: "0", totalAmount: "0", lines: [] });
  const [resolutionNote, setResolutionNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);

  const selectSale = (sale: Sale) => {
    setSelectedId(sale.id);
    setFormError(null);
    setComparison({ receiptBooklet: sale.receiptBooklet, receiptNumber: sale.manualReceiptNumber, paymentMethod: sale.paymentMethod, discountAmount: String(sale.discountAmount), amountPaid: String(sale.amountPaid), totalAmount: String(sale.totalAmount), lines: sale.lines.map((line) => ({ itemCode: line.itemCode, quantity: String(line.quantity), unitPrice: String(line.unitPrice) })) });
    setResolutionNote("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoKey(null);
  };

  const handlePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Receipt evidence must be an image file.");
      return;
    }
    if (file.size > 6_000_000) {
      setFormError("Receipt image must be 6 MB or smaller.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoKey(null);
  };

  const clearSelectedPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoKey(null);
  };

  const differences = selectedSale ? comparisonDifferences(selectedSale, comparison) : [];
  const canEditComparison = Boolean(selectedSale && (canReview || (canResolve && selectedSale.reviewStatus === "MISMATCH_REPORTED")));
  const updateComparison = (changes: Partial<ComparisonDraft>) => setComparison((current) => ({ ...current, ...changes }));

  return (
    <PageShell title="Receipt Verification" subtitle="Compare posted manual receipts with the branch encoding before closing the accounting queue.">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Sales queue</h2>
                <p className="text-sm text-slate-500">{sales.filter((sale) => sale.reviewStatus === "UNVERIFIED").length} unverified receipt(s)</p>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search receipt or customer" className="pl-9" />
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              {isLoading ? <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading receipts...</div> : error ? <p className="py-12 text-sm text-red-600">{(error as Error).message}</p> : filteredSales.length === 0 ? <p className="py-12 text-sm text-slate-500">No receipts match the current search.</p> : (
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Receipt</th><th className="px-3 py-3">Branch</th><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr></thead>
                  <tbody>{filteredSales.map((sale) => <tr key={sale.id} className="border-b last:border-0">
                    <td className="px-3 py-4"><p className="font-medium">{sale.manualReceiptNumber}</p><p className="text-xs text-slate-500">{sale.reference}</p></td>
                    <td className="px-3 py-4 text-slate-600">{sale.branch}</td>
                    <td className="px-3 py-4 text-slate-600">{sale.customer}</td>
                    <td className="px-3 py-4 font-medium">{formatPeso(sale.totalAmount)}</td>
                    <td className="px-3 py-4"><ReviewBadge status={sale.reviewStatus} /></td>
                    <td className="px-3 py-4 text-right"><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); selectSale(sale); }}>{selectedId === sale.id ? "Selected" : "Review"}</Button></td>
                  </tr>)}</tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            {!selectedSale ? <div className="flex min-h-80 items-center justify-center text-center text-sm text-slate-500">Select a receipt to compare its line items and manual receipt evidence.</div> : <div className="space-y-5">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">{selectedSale.reference}</p><h2 className="mt-1 text-lg font-semibold">Receipt {selectedSale.manualReceiptNumber}</h2><p className="text-sm text-slate-500">{selectedSale.branch} • posted by {selectedSale.postedBy}</p></div><ReviewBadge status={selectedSale.reviewStatus} /></div>
              <div className="rounded-xl border"><div className="divide-y">{selectedSale.lines.map((line) => <div key={`${line.itemCode}-${line.name}`} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium">{line.name}</p><p className="text-xs text-slate-500">{line.itemCode} • Qty {line.quantity}</p></div><p className="text-sm font-medium">{formatPeso(line.unitPrice * line.quantity)}</p></div>)}</div><div className="flex items-center justify-between border-t bg-slate-50 p-3 text-sm font-semibold"><span>Encoded total</span><span>{formatPeso(selectedSale.totalAmount)}</span></div></div>
              {selectedSale.reviewStatus === "MISMATCH_REPORTED" && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><p className="font-medium">Reported mismatch: {selectedSale.mismatchCategory?.replaceAll("_", " ") ?? "Uncategorized"}</p><p className="mt-1">{selectedSale.reviewNotes || "No notes recorded."}</p></div>}
              {selectedSale.receiptPhotoUrl && !photoPreview && <Image src={selectedSale.receiptPhotoUrl} alt="Attached manual receipt" width={800} height={600} unoptimized className="max-h-64 w-full rounded-xl border object-contain" />}
              {canEditComparison && selectedSale.reviewStatus !== "VERIFIED" ? <div className="space-y-4 border-t pt-4">
                <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="paper-booklet">Paper booklet</Label><Input id="paper-booklet" value={comparison.receiptBooklet} onChange={(event) => updateComparison({ receiptBooklet: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="paper-number">Paper receipt number</Label><Input id="paper-number" value={comparison.receiptNumber} onChange={(event) => updateComparison({ receiptNumber: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="paper-total">Paper total</Label><Input id="paper-total" inputMode="decimal" value={comparison.totalAmount} onChange={(event) => updateComparison({ totalAmount: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="paper-paid">Paper amount paid</Label><Input id="paper-paid" inputMode="decimal" value={comparison.amountPaid} onChange={(event) => updateComparison({ amountPaid: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="paper-discount">Paper discount</Label><Input id="paper-discount" inputMode="decimal" value={comparison.discountAmount} onChange={(event) => updateComparison({ discountAmount: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="paper-payment">Paper payment method</Label><select id="paper-payment" value={comparison.paymentMethod} onChange={(event) => updateComparison({ paymentMethod: event.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm">{["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"].map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select></div></div>
                <div><p className="mb-2 text-sm font-medium">Paper line items</p><div className="space-y-2">{comparison.lines.map((line, index) => <div key={`${line.itemCode}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_100px_120px]"><Input aria-label={`Item code ${index + 1}`} value={line.itemCode} onChange={(event) => setComparison((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, itemCode: event.target.value } : item) }))} /><Input aria-label={`Quantity ${index + 1}`} inputMode="numeric" value={line.quantity} onChange={(event) => setComparison((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item) }))} /><Input aria-label={`Unit price ${index + 1}`} inputMode="decimal" value={line.unitPrice} onChange={(event) => setComparison((current) => ({ ...current, lines: current.lines.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: event.target.value } : item) }))} /></div>)}</div></div>
                {differences.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Differences found: {differences.join(", ")}</p>}
                {canReview && <div className="flex flex-wrap gap-2"><Button onClick={() => reviewMutation.mutate("VERIFIED")} disabled={reviewMutation.isPending || differences.length > 0} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 h-4 w-4" />Confirm correct</Button><span className="self-center text-xs text-slate-500">Correct all comparison fields before confirming.</span></div>}
                {canReview && <><div className="grid gap-2"><Label htmlFor="mismatch-category">Mismatch category</Label><select id="mismatch-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{MISMATCH_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="mismatch-notes">Notes</Label><Textarea id="mismatch-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Describe the difference found on the handwritten receipt" /></div></>}
                <div className="grid gap-2"><Label htmlFor="receipt-photo">Receipt photo (optional)</Label><Input id="receipt-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhoto(event.target.files?.[0])} /><p className="text-xs text-slate-500">Optional even for Receipt Not Found. Upload only if you have supporting evidence.</p></div>
                {photoPreview && <div className="space-y-2"><Image src={photoPreview} alt="Receipt preview" width={800} height={600} unoptimized className="max-h-40 w-full rounded-xl border object-contain" /><Button type="button" variant="outline" size="sm" onClick={clearSelectedPhoto}>Remove selected image</Button></div>}
                {selectedSale.receiptPhotoUrl && !photoPreview && <p className="text-xs text-slate-500">A receipt image is already attached. Choose a new file above to replace it.</p>}
                {canReview && <Button variant="outline" onClick={() => { if (!notes.trim()) { setFormError("Notes are required when reporting a mismatch."); return; } reviewMutation.mutate("MISMATCH_REPORTED"); }} disabled={reviewMutation.isPending} className="border-rose-200 text-rose-700 hover:bg-rose-50"><AlertTriangle className="mr-2 h-4 w-4" />Report mismatch</Button>}
                {canResolve && selectedSale.reviewStatus === "MISMATCH_REPORTED" && <><div className="grid gap-2 border-t pt-4"><Label htmlFor="resolution-note">Resolution note</Label><Textarea id="resolution-note" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Explain why this mismatch is being resolved" /></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => resolveMutation.mutate("CONFIRMED_CORRECT")} disabled={resolveMutation.isPending || !resolutionNote.trim()} className="border-sky-200 text-sky-700">Confirm correct</Button><Button onClick={() => resolveMutation.mutate("VOIDED_REPLACED")} disabled={resolveMutation.isPending || !resolutionNote.trim()} className="bg-rose-600 hover:bg-rose-700"><Upload className="mr-2 h-4 w-4" />Void and replace</Button></div></>}
                {formError && <p className="text-sm text-red-600">{formError}</p>}
              </div> : null}
            </div>}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ReviewBadge({ status }: { status: Sale["reviewStatus"] }) {
  if (status === "VERIFIED") return <Badge className="bg-emerald-100 text-emerald-700">Verified</Badge>;
  if (status === "MISMATCH_REPORTED") return <Badge className="bg-rose-100 text-rose-700">Mismatch</Badge>;
  return <Badge variant="outline">Unverified</Badge>;
}
