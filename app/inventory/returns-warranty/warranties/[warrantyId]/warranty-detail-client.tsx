"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Warranty = { id: string; reference: string; version: number; status: string; resolution: string | null; customerName: string; productName: string; productItemCode: string; claimQuantity: number; concern: string; locationName: string; isLegacy: boolean; replacementProductName: string | null; intakePhotoName: string; events: Array<{ id: string; type: string; occurredAt: string; actor: { name: string } }> };
const actions: Record<string, Array<{ action: string; label: string; capability: string }>> = {
  ASSESSMENT: [{ action: "receive-quarantine", label: "Receive into quarantine", capability: "customer-warranties:receive-quarantine" }, { action: "approve-repair", label: "Approve repair", capability: "customer-warranties:approve" }, { action: "approve-replacement", label: "Approve same replacement", capability: "customer-warranties:approve" }, { action: "reject", label: "Reject", capability: "customer-warranties:complete" }, { action: "cancel", label: "Cancel", capability: "customer-warranties:complete" }],
  APPROVED_REPAIR: [{ action: "mark-ready", label: "Mark ready", capability: "customer-warranties:approve" }],
  APPROVED_REPLACEMENT: [{ action: "mark-ready", label: "Mark ready", capability: "customer-warranties:approve" }, { action: "waiting-stock", label: "Waiting stock", capability: "customer-warranties:approve" }],
  WAITING_STOCK: [{ action: "mark-ready", label: "Mark ready", capability: "customer-warranties:approve" }], READY: [{ action: "release", label: "Release", capability: "customer-warranties:release" }], RELEASED: [{ action: "complete", label: "Complete", capability: "customer-warranties:complete" }],
};

export function WarrantyDetailClient({ capabilities }: { capabilities: readonly string[] }) {
  const { warrantyId } = useParams<{ warrantyId: string }>(); const client = useQueryClient();
  const query = useQuery({ queryKey: ["customer-warranty", warrantyId], queryFn: async () => { const response = await fetch(`/api/customer-warranties/${warrantyId}`); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load warranty"); return json.data as Warranty; } });
  const mutation = useMutation({ mutationFn: async (action: string) => { const response = await fetch(`/api/customer-warranties/${warrantyId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), version: query.data!.version }) }); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to update warranty"); return json.data as Warranty; }, onSuccess: (data) => { client.setQueryData(["customer-warranty", warrantyId], data); client.invalidateQueries({ queryKey: ["customer-warranties"] }); } });
  const warranty = query.data;
  return <PageShell title={warranty?.reference ?? "Warranty detail"} subtitle="Claim assessment and inventory custody history." actions={<div className="flex gap-2"><Link href="/inventory/returns-warranty/warranties" className={buttonVariants({ variant: "outline" })}>Back to warranties</Link>{warranty && capabilities.includes("customer-warranties:print") ? <Link href={`/inventory/returns-warranty/warranties/${warranty.id}/print`} className={buttonVariants({ variant: "outline" })}>Print</Link> : null}</div>}>
    {query.isLoading ? <p className="text-muted-foreground">Loading warranty...</p> : query.error || !warranty ? <p className="text-destructive">{query.error?.message ?? "Warranty not found"}</p> : <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5"><Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Claim</CardTitle><Badge variant="outline">{warranty.status.replaceAll("_", " ")}</Badge></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div><span className="text-sm text-muted-foreground">Customer</span><p>{warranty.customerName}</p></div><div><span className="text-sm text-muted-foreground">Location</span><p>{warranty.locationName}</p></div><div><span className="text-sm text-muted-foreground">Item</span><p>{warranty.claimQuantity} x {warranty.productItemCode} - {warranty.productName}</p></div><div><span className="text-sm text-muted-foreground">Resolution</span><p>{warranty.resolution ?? "Pending assessment"}</p></div><div className="sm:col-span-2"><span className="text-sm text-muted-foreground">Concern</span><p>{warranty.concern}</p></div><a className="text-sm font-medium text-primary underline sm:col-span-2" href={`/api/customer-warranties/${warranty.id}/evidence`} target="_blank" rel="noreferrer">View private intake photo ({warranty.intakePhotoName})</a></CardContent></Card>
      <Card><CardHeader><CardTitle>Actions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{(actions[warranty.status] ?? []).filter((item) => capabilities.includes(item.capability)).map((item) => <Button key={item.action} variant={item.action === "reject" || item.action === "cancel" ? "outline" : "default"} disabled={mutation.isPending} onClick={() => mutation.mutate(item.action)}>{item.label}</Button>)}{mutation.error ? <p className="w-full text-sm text-destructive">{mutation.error.message}</p> : null}{!(actions[warranty.status] ?? []).some((item) => capabilities.includes(item.capability)) ? <p className="text-sm text-muted-foreground">No available actions.</p> : null}</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Audit trail</CardTitle></CardHeader><CardContent className="space-y-4">{warranty.events.map((event) => <div key={event.id} className="border-l-2 pl-3"><p className="text-sm font-medium">{event.type.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{event.actor.name} · {new Date(event.occurredAt).toLocaleString()}</p></div>)}</CardContent></Card>
    </div>}
  </PageShell>;
}
