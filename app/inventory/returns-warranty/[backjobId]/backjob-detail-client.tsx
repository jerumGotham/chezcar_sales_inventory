"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProductOption = { id: string; itemCode: string; name: string; availableQuantity: number; balanceVersion: number };
type Backjob = {
  id: string; reference: string; version: number; status: string; coverage: string; concern: string; notes: string | null; customerName: string; customerMobile: string | null; locationCode: string; locationName: string; affectedProductName: string | null; affectedProductItemCode: string | null; legacyProductDescription: string | null; originalSaleReference: string | null; originalReceiptNumber: string | null; scheduledFor: string | null; installerName: string | null; workPerformed: string | null; chargeSaleId: string | null; chargeableAmount: number;
  parts: Array<{ id: string; productId: string; productItemCode: string; productName: string; plannedQuantity: number; issuedQuantity: number; usedQuantity: number | null; returnedQuantity: number }>;
  events: Array<{ id: string; type: string; reason: string | null; occurredAt: string; actor: { name: string } }>;
  schedules: Array<{ id: string; previousSchedule: string | null; newSchedule: string; reason: string | null; recordedAt: string; actor: { name: string } }>;
  attachments: Array<{ id: string; fileName: string; contentType: string; caption: string | null; uploadedAt: string }>;
  options: { installers: Array<{ id: string; fullName: string }>; products: ProductOption[]; chargeSales: Array<{ id: string; reference: string; manualReceiptNumber: string; totalAmount: number }> };
};

export function BackjobDetailClient({ backjobId }: { backjobId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["backjob", backjobId], queryFn: async () => { const response = await fetch(`/api/backjobs/${backjobId}`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Unable to load Backjob"); return body.data as Backjob; } });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [installerId, setInstallerId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [coverage, setCoverage] = useState("COVERED");
  const [chargeSaleId, setChargeSaleId] = useState("");
  const [chargeableAmount, setChargeableAmount] = useState("0");
  const [planProductId, setPlanProductId] = useState("");
  const [planQuantity, setPlanQuantity] = useState("1");
  const [workPerformed, setWorkPerformed] = useState("");
  const [acknowledgedByName, setAcknowledgedByName] = useState("");
  const [acknowledgementMethod, setAcknowledgementMethod] = useState("VERBAL");

  async function action(name: string, payload: Record<string, unknown> = {}) {
    if (!query.data) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/backjobs/${backjobId}/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: query.data.version, ...payload }) });
    const body = await response.json(); setBusy(false);
    if (!response.ok) return setError(body.error?.message ?? "Unable to update Backjob");
    await client.invalidateQueries({ queryKey: ["backjob", backjobId] });
  }

  if (query.isLoading) return <PageShell title="Backjob" subtitle="Loading durable record..."><p>Loading...</p></PageShell>;
  if (!query.data) return <PageShell title="Backjob" subtitle="Unable to load record"><p className="text-destructive">{query.error?.message}</p></PageShell>;
  const row = query.data;
  const open = !["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status);
  return <PageShell title={row.reference} subtitle={`${row.customerName} · ${row.locationCode}`} actions={<div className="flex gap-2"><Link className={buttonVariants({ variant: "outline" })} href="/inventory/returns-warranty">Back to list</Link><Link className={buttonVariants({ variant: "outline" })} href={`/inventory/returns-warranty/${row.id}/print`}>Print</Link></div>}>
    <div className="mb-4 flex flex-wrap gap-2"><Badge>{row.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">{row.coverage}</Badge>{row.originalReceiptNumber ? <Badge variant="outline">Receipt {row.originalReceiptNumber}</Badge> : <Badge variant="outline">Legacy</Badge>}</div>
    {error ? <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="grid content-start gap-4 xl:col-span-2">
        <Card><CardHeader><CardTitle>Case</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Info label="Customer" value={`${row.customerName}${row.customerMobile ? ` · ${row.customerMobile}` : ""}`} /><Info label="Product" value={row.affectedProductName ? `${row.affectedProductItemCode} · ${row.affectedProductName}` : row.legacyProductDescription ?? "Not recorded"} /><Info label="Original sale" value={row.originalSaleReference ?? "Legacy source"} /><Info label="Schedule" value={row.scheduledFor ? `${new Date(row.scheduledFor).toLocaleString()} · ${row.installerName}` : "Not scheduled"} /><div className="sm:col-span-2"><Info label="Concern" value={row.concern} /></div></CardContent></Card>
        {open ? <Card><CardHeader><CardTitle>Workflow</CardTitle></CardHeader><CardContent className="grid gap-4">
          {(row.status === "DRAFT" || row.status === "SCHEDULED") ? <div className="grid gap-2 sm:grid-cols-3"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={installerId} onChange={(e) => setInstallerId(e.target.value)}><option value="">Installer</option>{row.options.installers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select><Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /><Button disabled={busy || !installerId || !scheduledFor} onClick={() => action("schedule", { installerId, scheduledFor: new Date(scheduledFor).toISOString(), reason: reason || undefined })}>{row.status === "SCHEDULED" ? "Reschedule" : "Schedule"}</Button></div> : null}
          {row.status === "SCHEDULED" ? <Button className="w-fit" disabled={busy} onClick={() => action("start")}>Start work</Button> : null}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input placeholder="Required cancellation/rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} /><Button variant="outline" disabled={busy || !reason} onClick={() => action("cancel", { reason })}>Cancel</Button>{row.status === "DRAFT" ? <Button variant="destructive" disabled={busy || !reason} onClick={() => action("reject", { reason })}>Reject</Button> : null}</div>
        </CardContent></Card> : null}
        {open ? <Card><CardHeader><CardTitle>Coverage</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-4"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={coverage} onChange={(e) => setCoverage(e.target.value)}><option value="COVERED">Covered</option><option value="CHARGEABLE">Chargeable</option></select>{coverage === "CHARGEABLE" ? <><select className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-2" value={chargeSaleId} onChange={(e) => setChargeSaleId(e.target.value)}><option value="">Posted same-customer sale</option>{row.options.chargeSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.reference} · receipt {sale.manualReceiptNumber}</option>)}</select><Input type="number" min="0" step="0.01" value={chargeableAmount} onChange={(e) => setChargeableAmount(e.target.value)} /></> : null}<Button disabled={busy} onClick={() => action("coverage", { coverage, chargeSaleId: coverage === "CHARGEABLE" ? chargeSaleId : undefined, chargeableAmount: coverage === "CHARGEABLE" ? Number(chargeableAmount) : 0 })}>Save coverage</Button></CardContent></Card> : null}
        <Card><CardHeader><CardTitle>Parts</CardTitle></CardHeader><CardContent className="grid gap-3">
          {(row.status === "DRAFT" || row.status === "SCHEDULED") && row.parts.every((part) => part.issuedQuantity === 0) ? <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={planProductId} onChange={(e) => setPlanProductId(e.target.value)}><option value="">Add active product</option>{row.options.products.filter((item) => !row.parts.some((part) => part.productId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.name} · {item.availableQuantity} available</option>)}</select><Input type="number" min="1" value={planQuantity} onChange={(e) => setPlanQuantity(e.target.value)} /><Button disabled={!planProductId || busy} onClick={() => action("plan-parts", { parts: [...row.parts.map((part) => ({ productId: part.productId, plannedQuantity: part.plannedQuantity })), { productId: planProductId, plannedQuantity: Number(planQuantity) }] })}>Add</Button></div> : null}
          {row.parts.length === 0 ? <p className="text-sm text-muted-foreground">No parts planned.</p> : row.parts.map((part) => <PartRow key={part.id} part={part} product={row.options.products.find((item) => item.id === part.productId)} status={row.status} busy={busy} onAction={action} onRemove={() => action("plan-parts", { parts: row.parts.filter((item) => item.id !== part.id).map((item) => ({ productId: item.productId, plannedQuantity: item.plannedQuantity })) })} />)}
        </CardContent></Card>
        {row.status === "IN_PROGRESS" ? <Card><CardHeader><CardTitle>Complete work</CardTitle></CardHeader><CardContent className="grid gap-3"><Field label="Work performed"><Textarea value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Acknowledgement"><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={acknowledgementMethod} onChange={(e) => setAcknowledgementMethod(e.target.value)}><option value="SIGNED">Signed</option><option value="VERBAL">Verbal</option><option value="DECLINED">Declined</option></select></Field><Field label="Acknowledged by"><Input value={acknowledgedByName} onChange={(e) => setAcknowledgedByName(e.target.value)} /></Field></div><Button className="w-fit" disabled={busy || !workPerformed || !acknowledgedByName} onClick={() => action("complete", { workPerformed, acknowledgementMethod, acknowledgedByName })}>Complete Backjob</Button></CardContent></Card> : null}
      </div>
      <div className="grid content-start gap-4">
        <Card><CardHeader><CardTitle>Attachments</CardTitle></CardHeader><CardContent className="grid gap-2">{row.attachments.length ? row.attachments.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><strong>{item.fileName}</strong><div className="text-muted-foreground">{item.contentType} · {new Date(item.uploadedAt).toLocaleString()}</div>{item.caption ? <p>{item.caption}</p> : null}</div>) : <p className="text-sm text-muted-foreground">No attachment metadata. Binary upload is not implemented.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Schedule history</CardTitle></CardHeader><CardContent className="grid gap-3">{row.schedules.length ? row.schedules.map((item) => <Timeline key={item.id} title={new Date(item.newSchedule).toLocaleString()} meta={`${item.actor.name} · ${new Date(item.recordedAt).toLocaleString()}`} note={item.reason} />) : <p className="text-sm text-muted-foreground">No schedules recorded.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Events</CardTitle></CardHeader><CardContent className="grid gap-3">{row.events.map((item) => <Timeline key={item.id} title={item.type.replaceAll("_", " ")} meta={`${item.actor.name} · ${new Date(item.occurredAt).toLocaleString()}`} note={item.reason} />)}</CardContent></Card>
      </div>
    </div>
  </PageShell>;
}

function PartRow({ part, product, status, busy, onAction, onRemove }: { part: Backjob["parts"][number]; product?: ProductOption; status: string; busy: boolean; onAction: (name: string, payload?: Record<string, unknown>) => void; onRemove: () => void }) {
  const [quantity, setQuantity] = useState("1");
  const [used, setUsed] = useState(String(part.usedQuantity ?? 0));
  return <div className="rounded-md border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm">{part.productItemCode} · {part.productName}</strong><p className="text-xs text-muted-foreground">Planned {part.plannedQuantity} · issued {part.issuedQuantity} · used {part.usedQuantity ?? "unrecorded"} · returned {part.returnedQuantity} · available {product?.availableQuantity ?? 0}</p></div>{(status === "DRAFT" || status === "SCHEDULED") && part.issuedQuantity === 0 ? <Button size="sm" variant="ghost" onClick={onRemove}>Remove</Button> : null}</div><div className="mt-3 flex flex-wrap gap-2"><Input className="w-24" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />{(status === "SCHEDULED" || status === "IN_PROGRESS") ? <Button size="sm" disabled={busy || !product} onClick={() => onAction("issue-part", { partId: part.id, quantity: Number(quantity), balanceVersion: product?.balanceVersion })}>Issue</Button> : null}{status === "IN_PROGRESS" ? <><Input className="w-24" type="number" min="0" value={used} onChange={(e) => setUsed(e.target.value)} /><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("reconcile-part", { partId: part.id, usedQuantity: Number(used) })}>Set used</Button><Button size="sm" variant="outline" disabled={busy || !product} onClick={() => onAction("return-part", { partId: part.id, quantity: Number(quantity), balanceVersion: product?.balanceVersion })}>Return</Button></> : null}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 whitespace-pre-wrap">{value}</div></div>; }
function Timeline({ title, meta, note }: { title: string; meta: string; note: string | null }) { return <div className="border-l-2 pl-3 text-sm"><strong>{title}</strong><div className="text-xs text-muted-foreground">{meta}</div>{note ? <p className="mt-1">{note}</p> : null}</div>; }
