"use client";

import { useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Clock, PackageCheck, PackagePlus, Printer, Receipt, Send, Trash2, Undo2, Upload, Wrench, X, type LucideIcon } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { ClaimEvidenceInput } from "@/components/claim-evidence-input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supplierClaimActionCapabilities, supplierClaimActionLabels, supplierClaimReasonLabels, supplierClaimStatusLabels, type SupplierClaimAction } from "@/lib/contracts/supplier-claims";

type Line = { productId: string; productItemCode: string; productName: string; reason: string; claimedQuantity: number; openQuarantinedQuantity: number; openMissingQuantity: number };
type Claim = { id: string; reference: string; version: number; status: string; supplierName: string; locationName: string; notes?: string; targetDate?: string; lines: Line[]; actions: Array<{ id: string; action: string; createdAt: string; actor: { name: string } }>; settlements: Array<{ id: string; type: string; amount: string; currency: string; reference: string }>; evidence: Array<{ id: string; fileName: string }> };

const SIMPLE_ACTIONS: readonly SupplierClaimAction[] = ["submit", "wait-replacement", "reject", "complete", "cancel"];
const QUANTITY_ACTIONS: readonly SupplierClaimAction[] = ["return-to-supplier", "send-repair", "receive-replacement", "release-repaired", "receive-repaired", "writeoff"];

const ACTION_ICONS: Record<SupplierClaimAction, LucideIcon> = {
  submit: Send,
  "wait-replacement": Clock,
  reject: Ban,
  complete: CheckCircle2,
  cancel: X,
  "return-to-supplier": Undo2,
  "send-repair": Wrench,
  "receive-replacement": PackagePlus,
  "release-repaired": PackageCheck,
  "receive-repaired": PackagePlus,
  writeoff: Trash2,
};

export function SupplierClaimDetailClient({ capabilities }: { capabilities: readonly string[] }) {
  const claimId = String(useParams().claimId);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [settlementPending, setSettlementPending] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const targetDateRef = useRef<HTMLInputElement>(null);
  const actionKeyRef = useRef<{ signature: string; key: string } | null>(null);
  const settlementKeyRef = useRef<string | null>(null);
  const query = useQuery({ queryKey: ["supplier-claim", claimId], queryFn: async () => { const response = await fetch(`/api/supplier-claims/${claimId}`); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load claim"); return json.data as Claim; } });
  const mutation = useMutation({ mutationFn: async ({ action, idempotencyKey, lines = [], targetDate }: { action: SupplierClaimAction; idempotencyKey: string; lines?: Array<{ productId: string; quantity: number }>; targetDate?: string }) => { const response = await fetch(`/api/supplier-claims/${claimId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: query.data!.version, idempotencyKey, lines, targetDate }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to update claim"); return json.data as Claim; }, onSuccess: (data) => { actionKeyRef.current = null; queryClient.setQueryData(["supplier-claim", claimId], data); } });
  const claim = query.data;
  if (!claim) return <PageShell title="Supplier claim" subtitle={query.error?.message ?? "Loading claim..."}><></></PageShell>;

  const actionLines = (action: SupplierClaimAction) => claim.lines.flatMap((line) => { const quantity = ["receive-replacement", "receive-repaired"].includes(action) ? line.openMissingQuantity : line.openQuarantinedQuantity; return quantity ? [{ productId: line.productId, quantity }] : []; });
  const runAction = (action: SupplierClaimAction, lines: Array<{ productId: string; quantity: number }> = []) => { const targetDate = action === "submit" && targetDateRef.current?.value ? new Date(targetDateRef.current.value).toISOString() : undefined; const signature = JSON.stringify({ action, lines, targetDate, version: claim.version }); const idempotencyKey = actionKeyRef.current?.signature === signature ? actionKeyRef.current.key : crypto.randomUUID(); actionKeyRef.current = { signature, key: idempotencyKey }; mutation.mutate({ action, lines, idempotencyKey, targetDate }); };
  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadPending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setUploadPending(true); setMessage("");
    try {
      const response = await fetch(`/api/supplier-claims/${claimId}/evidence`, { method: "POST", body: form });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error?.message ?? "Unable to upload the attachment.");
      formElement.reset(); setAttachment(null); setMessage("Attachment uploaded.");
      await queryClient.invalidateQueries({ queryKey: ["supplier-claim", claimId] });
    } catch (caught) {
      setMessage(caught instanceof TypeError ? "Connection interrupted. Refresh the attachment list before retrying; the upload may have been saved." : caught instanceof Error ? caught.message : "Unable to upload the attachment.");
    } finally { setUploadPending(false); }
  }
  async function recordSettlement(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const currentClaim = query.data; if (!currentClaim || settlementPending) return; const formElement = event.currentTarget; const form = new FormData(formElement); const idempotencyKey = settlementKeyRef.current ?? crypto.randomUUID(); settlementKeyRef.current = idempotencyKey; setSettlementPending(true); setMessage(""); try { const lines = currentClaim.lines.flatMap((line) => { const quantity = Number(form.get(`quantity:${line.productId}`)); return quantity > 0 ? [{ productId: line.productId, quantity }] : []; }); const response = await fetch(`/api/supplier-claims/${claimId}/settlements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey, type: form.get("type"), amount: Number(form.get("amount")), reference: form.get("reference"), currency: "PHP", lines }) }); const json = await response.json().catch(() => null); if (!response.ok) throw new Error(json?.error?.message ?? "Unable to record the refund or credit."); settlementKeyRef.current = null; formElement.reset(); setMessage("Refund or credit recorded."); await queryClient.invalidateQueries({ queryKey: ["supplier-claim", claimId] }); } catch (caught) { setMessage(caught instanceof TypeError ? "Connection interrupted. Retry with the same details to avoid recording a duplicate." : caught instanceof Error ? caught.message : "Unable to record the refund or credit."); } finally { setSettlementPending(false); } }

  return <PageShell title={claim.reference} subtitle={`${claim.supplierName} at ${claim.locationName}`} actions={<div className="flex flex-wrap items-center gap-2"><Link className={buttonVariants({ variant: "outline" })} href="/inventory/returns-warranty/supplier-claims"><ArrowLeft aria-hidden="true" />Back to supplier claims</Link><Badge variant="outline">{supplierClaimStatusLabels[claim.status] ?? claim.status}</Badge>{capabilities.includes("supplier-claims:print") ? <Link className={buttonVariants({ variant: "outline" })} href={`/inventory/returns-warranty/supplier-claims/${claim.id}/print`}><Printer aria-hidden="true" />Print</Link> : null}</div>}>
    {message ? <p role="status" className="mb-3 rounded-md bg-muted p-3 text-sm">{message}</p> : null}{mutation.error ? <p role="alert" className="mb-3 text-sm text-destructive">{mutation.error.message}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><Card className="min-w-0"><CardHeader><CardTitle>Claimed items</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Item</th><th>Issue</th><th>Claimed</th><th>Held at location</th><th>Awaiting supplier</th></tr></thead><tbody>{claim.lines.map((line) => <tr key={line.productId} className="border-b"><td className="py-3"><strong>{line.productItemCode}</strong><div className="text-muted-foreground">{line.productName}</div></td><td>{supplierClaimReasonLabels[line.reason] ?? line.reason}</td><td>{line.claimedQuantity}</td><td>{line.openQuarantinedQuantity}</td><td>{line.openMissingQuantity}</td></tr>)}</tbody></table></div><p className="mt-3 text-sm text-muted-foreground">Held items are in quarantine and cannot be sold. Awaiting supplier includes missing delivery items and items sent back or out for repair.</p><div className="mt-4 max-w-xs space-y-2"><Label htmlFor="supplier-claim-target">Follow-up date and time</Label><Input ref={targetDateRef} id="supplier-claim-target" type="datetime-local" defaultValue={claim.targetDate ? new Date(new Date(claim.targetDate).getTime() - new Date(claim.targetDate).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ""} aria-describedby="supplier-target-help" /><p id="supplier-target-help" className="text-sm text-muted-foreground">A future date is required when submitting the draft.</p></div><div className="mt-4 flex flex-wrap gap-2">{SIMPLE_ACTIONS.filter((action) => capabilities.includes(supplierClaimActionCapabilities[action])).map((action) => {
      const Icon = ACTION_ICONS[action];
      return <Button key={action} type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => runAction(action)}><Icon aria-hidden="true" />{supplierClaimActionLabels[action]}</Button>;
    })}{QUANTITY_ACTIONS.filter((action) => capabilities.includes(supplierClaimActionCapabilities[action])).map((action) => {
      const Icon = ACTION_ICONS[action];
      return <Button key={action} type="button" size="sm" variant="outline" className="h-auto min-h-7 whitespace-normal text-left" disabled={mutation.isPending || actionLines(action).length === 0} onClick={() => runAction(action, actionLines(action))}><Icon aria-hidden="true" /><span>{supplierClaimActionLabels[action]} ({actionLines(action).reduce((sum, line) => sum + line.quantity, 0)})</span></Button>;
    })}</div><p className="mt-3 text-sm text-muted-foreground">Quantity buttons apply to all remaining eligible items shown above. Record these actions only after the physical movement or repair is confirmed. Making repaired items sellable removes the quarantine hold without moving them out of this location.</p></CardContent></Card>
      <div className="min-w-0 space-y-4"><Card><CardHeader><CardTitle className="text-base">Photos and documents</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p id="supplier-evidence-help" className="text-muted-foreground">Damage or defect claims need an uploaded photo before submission; a PDF alone does not meet this requirement. Remove clears only a selected file, not saved attachments.</p>{claim.evidence.length === 0 ? <p className="text-muted-foreground">No attachments uploaded.</p> : claim.evidence.map((item) => <a key={item.id} className="block break-all underline" href={`/api/supplier-claims/${claim.id}/evidence/${item.id}`}>{item.fileName}</a>)}{capabilities.includes("supplier-claims:evidence") ? <form onSubmit={uploadEvidence} className="space-y-2"><fieldset disabled={uploadPending} className="space-y-2"><Label htmlFor="claim-attachment">Attach a photo or PDF</Label><ClaimEvidenceInput id="claim-attachment" name="file" file={attachment} onChange={setAttachment} accept="image/jpeg,image/png,image/webp,application/pdf" required disabled={uploadPending} describedBy="supplier-evidence-help" /><Label htmlFor="claim-caption">Caption (optional)</Label><Input id="claim-caption" name="caption" /><Button type="submit" size="sm" disabled={uploadPending || !attachment}><Upload aria-hidden="true" />{uploadPending ? "Uploading..." : "Upload attachment"}</Button></fieldset></form> : null}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Supplier refunds and credits</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{claim.settlements.map((item) => <div key={item.id}>{item.type === "REFUND" ? "Cash refund" : "Credit memo"}: {item.currency} {item.amount} · {item.reference}</div>)}{capabilities.includes("supplier-claims:record-monetary-resolution") ? <form onSubmit={recordSettlement} onChange={() => { settlementKeyRef.current = null; }} className="space-y-2"><fieldset disabled={settlementPending} className="space-y-2"><Label htmlFor="settlement-type">Refund or credit</Label><select id="settlement-type" name="type" className="h-9 w-full rounded-md border bg-background px-2"><option value="REFUND">Cash refund</option><option value="CREDIT">Credit memo</option></select><Label htmlFor="settlement-amount">Amount (PHP)</Label><Input id="settlement-amount" name="amount" type="number" min="0.01" step="0.01" required /><Label htmlFor="settlement-reference">Reference number</Label><Input id="settlement-reference" name="reference" required />{claim.lines.filter((line) => line.openMissingQuantity > 0).map((line) => <div key={line.productId} className="space-y-1"><Label htmlFor={`settlement-${line.productId}`}>{line.productItemCode} quantity covered (max {line.openMissingQuantity})</Label><Input id={`settlement-${line.productId}`} name={`quantity:${line.productId}`} type="number" min="0" max={line.openMissingQuantity} step="1" defaultValue={line.openMissingQuantity} /></div>)}<Button type="submit" size="sm" disabled={settlementPending || !claim.lines.some((line) => line.openMissingQuantity > 0)}><Receipt aria-hidden="true" />{settlementPending ? "Recording..." : "Record refund or credit"}</Button></fieldset></form> : null}<p className="text-xs text-muted-foreground">Records the supplier&apos;s refund or credit against quantities awaiting resolution. This does not move stock or post an accounting entry. Held items still need a separate return, repair release, or write-off.</p></CardContent></Card></div>
    </div>
  </PageShell>;
}
