"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CalendarDays, CheckCircle2, ClipboardCheck, PackageMinus, Play, Plus, Printer, Save, Trash2, Undo2, X } from "lucide-react";
import Select, { type StylesConfig } from "react-select";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BackjobItemDto } from "@/lib/contracts/backjobs";

type ProductOption = { id: string; itemCode: string; name: string; availableQuantity: number; balanceVersion: number };
type ChargeSaleOption = { value: string; label: string };

const chargeSaleSelectStyles: StylesConfig<ChargeSaleOption, false> = {
  control: (base, state) => ({ ...base, minHeight: "36px", backgroundColor: "var(--background)", borderColor: state.isFocused ? "var(--ring)" : "var(--input)", boxShadow: "none" }),
  input: (base) => ({ ...base, color: "var(--foreground)" }),
  singleValue: (base) => ({ ...base, color: "var(--foreground)" }),
  placeholder: (base) => ({ ...base, color: "var(--muted-foreground)" }),
  menu: (base) => ({ ...base, zIndex: 50, backgroundColor: "var(--popover)" }),
  option: (base, state) => ({ ...base, color: state.isSelected ? "var(--primary-foreground)" : "var(--popover-foreground)", backgroundColor: state.isSelected ? "var(--primary)" : state.isFocused ? "var(--accent)" : "var(--popover)" }),
};
type Backjob = {
  items: BackjobItemDto[];
  id: string; reference: string; version: number; status: string; coverage: string; concern: string; notes: string | null; customerName: string; customerMobile: string | null; locationCode: string; locationName: string; affectedProductName: string | null; affectedProductItemCode: string | null; legacyProductDescription: string | null; originalSaleReference: string | null; originalReceiptNumber: string | null; scheduledFor: string | null; installerName: string | null; workPerformed: string | null; chargeSaleId: string | null; chargeableAmount: number;
  parts: Array<{ id: string; productId: string; productItemCode: string; productName: string; plannedQuantity: number; issuedQuantity: number; usedQuantity: number | null; returnedQuantity: number }>;
  events: Array<{ id: string; type: string; reason: string | null; occurredAt: string; actor: { name: string } }>;
  schedules: Array<{ id: string; previousSchedule: string | null; newSchedule: string; reason: string | null; recordedAt: string; actor: { name: string } }>;
  attachments: Array<{ id: string; fileName: string; contentType: string; caption: string | null; uploadedAt: string }>;
  options: { installers: Array<{ id: string; fullName: string }>; products: ProductOption[]; chargeSales: Array<{ id: string; reference: string; manualReceiptNumber: string; totalAmount: number }> };
};

export function BackjobDetailClient({ backjobId, capabilities }: { backjobId: string; capabilities: readonly string[] }) {
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["backjob", backjobId], queryFn: async () => { const response = await fetch(`/api/backjobs/${backjobId}`); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Unable to load Backjob"); return body.data as Backjob; } });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  async function deleteDraft() {
    if (!query.data || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/backjobs/${backjobId}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: query.data.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to delete Backjob");
      await client.invalidateQueries({ queryKey: ["backjobs"] });
      setConfirmDelete(false);
      router.replace("/inventory/returns-warranty");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete Backjob");
      await client.invalidateQueries({ queryKey: ["backjob", backjobId] });
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <PageShell title="Backjob" subtitle="Loading durable record..."><p>Loading...</p></PageShell>;
  if (!query.data) return <PageShell title="Backjob" subtitle="Unable to load record"><p className="text-destructive">{query.error?.message}</p></PageShell>;
  const row = query.data;
  const chargeSaleOptions = row.options.chargeSales.map((sale) => ({ value: sale.id, label: `${sale.manualReceiptNumber} - ${row.customerName}` }));
  const open = !["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status);
  const canUpdate = capabilities.includes("backjobs:update");
  return <PageShell title={row.reference} subtitle={`${row.customerName} · ${row.locationCode}`} actions={<div className="flex flex-wrap gap-2"><Link className={buttonVariants({ variant: "outline" })} href="/inventory/returns-warranty"><ArrowLeft aria-hidden="true" />Back to list</Link>{capabilities.includes("backjobs:print") ? <Link className={buttonVariants({ variant: "outline" })} href={`/inventory/returns-warranty/${row.id}/print`} target="_blank" rel="noopener noreferrer"><Printer aria-hidden="true" />Print</Link> : null}{row.status === "DRAFT" && capabilities.includes("backjobs:delete") ? <Button variant="destructive" disabled={busy} onClick={() => { setError(""); setConfirmDelete(true); }}><Trash2 aria-hidden="true" />Delete draft</Button> : null}</div>}>
    <Dialog open={confirmDelete} onOpenChange={(open) => { if (!busy) setConfirmDelete(open); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Delete this Backjob draft?</DialogTitle><DialogDescription>{row.reference} will be permanently deleted, including its purchased-item selections and unused parts plan. Only drafts without stock, financial, scheduling, attachment, or work evidence can be deleted. The original sale is not changed.</DialogDescription></DialogHeader>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep draft</Button><Button variant="destructive" disabled={busy || row.status !== "DRAFT"} onClick={() => void deleteDraft()}><Trash2 aria-hidden="true" />{busy ? "Deleting..." : "Delete permanently"}</Button></DialogFooter></DialogContent></Dialog>
    <div className="mb-4 flex flex-wrap gap-2"><Badge>{row.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">{row.coverage}</Badge>{row.originalReceiptNumber ? <Badge variant="outline">Receipt {row.originalReceiptNumber}</Badge> : <Badge variant="outline">Legacy</Badge>}</div>
    {error ? <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="grid content-start gap-4 xl:col-span-2">
        <Card><CardHeader><CardTitle>Case</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><Info label="Customer" value={`${row.customerName}${row.customerMobile ? ` · ${row.customerMobile}` : ""}`} /><Info label="Purchased items / legacy description" value={row.items.map((item) => `${item.productItemCode ? `${item.productItemCode} - ` : ""}${item.productName}`).join("\n")} /><Info label="Original sale" value={row.originalSaleReference ?? "Legacy source"} /><Info label="Schedule" value={row.scheduledFor ? `${new Date(row.scheduledFor).toLocaleString()} · ${row.installerName}` : "Not scheduled"} /><Info label="Customer charge" value={row.coverage === "CHARGEABLE" ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(row.chargeableAmount) : row.coverage === "COVERED" ? "No charge (covered)" : "Not yet decided"} /><div className="sm:col-span-2"><Info label="Concern" value={row.concern} /></div></CardContent></Card>
        {open && (canUpdate || capabilities.includes("backjobs:schedule")) ? <Card><CardHeader><CardTitle>Workflow</CardTitle></CardHeader><CardContent className="grid gap-4">
          {(row.status === "DRAFT" || row.status === "SCHEDULED") && capabilities.includes("backjobs:schedule") ? <div className="grid gap-2 sm:grid-cols-3"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={installerId} onChange={(e) => setInstallerId(e.target.value)}><option value="">Installer</option>{row.options.installers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select><Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /><Button disabled={busy || !installerId || !scheduledFor} onClick={() => action("schedule", { installerId, scheduledFor: new Date(scheduledFor).toISOString(), reason: reason || undefined })}><CalendarDays aria-hidden="true" />{row.status === "SCHEDULED" ? "Reschedule" : "Schedule"}</Button></div> : null}
          {row.status === "SCHEDULED" && canUpdate ? <Button className="w-fit" disabled={busy} onClick={() => action("start")}><Play aria-hidden="true" />Start work</Button> : null}
          {canUpdate ? <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input placeholder="Required cancellation/rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} /><Button variant="outline" disabled={busy || !reason} onClick={() => action("cancel", { reason })}><X aria-hidden="true" />Cancel</Button>{row.status === "DRAFT" ? <Button variant="destructive" disabled={busy || !reason} onClick={() => action("reject", { reason })}><Ban aria-hidden="true" />Reject</Button> : null}</div> : null}
        </CardContent></Card> : null}
        {open && canUpdate ? <Card><CardHeader><CardTitle>Coverage</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-4"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={coverage} onChange={(e) => setCoverage(e.target.value)}><option value="COVERED">Covered</option><option value="CHARGEABLE">Chargeable</option></select>{coverage === "CHARGEABLE" ? <><Select<ChargeSaleOption>
          instanceId="backjob-charge-sale"
          inputId="backjob-charge-sale"
          aria-label="Posted same-customer sale"
          isSearchable
          isClearable
          isDisabled={busy}
          options={chargeSaleOptions}
          value={chargeSaleOptions.find((sale) => sale.value === chargeSaleId) ?? null}
          filterOption={(option, search) => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())}
          onChange={(sale) => setChargeSaleId(sale?.value ?? "")}
          placeholder="Search receipt or customer"
          noOptionsMessage={() => "No matching posted sales"}
          styles={chargeSaleSelectStyles}
          className="min-w-0 text-sm sm:col-span-2"
        /><Input type="number" min="0" step="0.01" value={chargeableAmount} onChange={(e) => setChargeableAmount(e.target.value)} /></> : null}<Button disabled={busy} onClick={() => action("coverage", { coverage, chargeSaleId: coverage === "CHARGEABLE" ? chargeSaleId : undefined, chargeableAmount: coverage === "CHARGEABLE" ? Number(chargeableAmount) : 0 })}><Save aria-hidden="true" />Save coverage</Button></CardContent></Card> : null}
        <Card><CardHeader><CardTitle>Parts</CardTitle></CardHeader><CardContent className="grid gap-3">
          {(row.status === "DRAFT" || row.status === "SCHEDULED") && row.parts.every((part) => part.issuedQuantity === 0) && canUpdate ? <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]"><select className="h-9 rounded-md border bg-background px-2 text-sm" value={planProductId} onChange={(e) => setPlanProductId(e.target.value)}><option value="">Add active product</option>{row.options.products.filter((item) => !row.parts.some((part) => part.productId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.itemCode} · {item.name} · {item.availableQuantity} available</option>)}</select><Input type="number" min="1" value={planQuantity} onChange={(e) => setPlanQuantity(e.target.value)} /><Button disabled={!planProductId || busy} onClick={() => action("plan-parts", { parts: [...row.parts.map((part) => ({ productId: part.productId, plannedQuantity: part.plannedQuantity })), { productId: planProductId, plannedQuantity: Number(planQuantity) }] })}><Plus aria-hidden="true" />Add</Button></div> : null}
          {row.parts.length === 0 ? <p className="text-sm text-muted-foreground">No parts planned.</p> : row.parts.map((part) => <PartRow key={part.id} part={part} product={row.options.products.find((item) => item.id === part.productId)} status={row.status} busy={busy} canUpdate={canUpdate} canIssue={capabilities.includes("backjobs:parts:issue")} canReturn={capabilities.includes("backjobs:parts:return")} onAction={action} onRemove={() => action("plan-parts", { parts: row.parts.filter((item) => item.id !== part.id).map((item) => ({ productId: item.productId, plannedQuantity: item.plannedQuantity })) })} />)}
        </CardContent></Card>
        {row.status === "IN_PROGRESS" && capabilities.includes("backjobs:complete") ? <Card><CardHeader><CardTitle>Complete work</CardTitle></CardHeader><CardContent className="grid gap-3"><Field label="Work performed"><Textarea value={workPerformed} onChange={(e) => setWorkPerformed(e.target.value)} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Acknowledgement"><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={acknowledgementMethod} onChange={(e) => setAcknowledgementMethod(e.target.value)}><option value="SIGNED">Signed</option><option value="VERBAL">Verbal</option><option value="DECLINED">Declined</option></select></Field><Field label="Acknowledged by"><Input value={acknowledgedByName} onChange={(e) => setAcknowledgedByName(e.target.value)} /></Field></div><Button className="w-fit" disabled={busy || !workPerformed || !acknowledgedByName} onClick={() => action("complete", { workPerformed, acknowledgementMethod, acknowledgedByName })}><CheckCircle2 aria-hidden="true" />Complete Backjob</Button></CardContent></Card> : null}
      </div>
      <div className="grid content-start gap-4">
        <Card><CardHeader><CardTitle>Schedule history</CardTitle></CardHeader><CardContent className="grid gap-3">{row.schedules.length ? row.schedules.map((item) => <Timeline key={item.id} title={new Date(item.newSchedule).toLocaleString()} meta={`${item.actor.name} · ${new Date(item.recordedAt).toLocaleString()}`} note={item.reason} />) : <p className="text-sm text-muted-foreground">No schedules recorded.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Events</CardTitle></CardHeader><CardContent className="grid gap-3">{row.events.map((item) => <Timeline key={item.id} title={item.type.replaceAll("_", " ")} meta={`${item.actor.name} · ${new Date(item.occurredAt).toLocaleString()}`} note={item.reason} />)}</CardContent></Card>
      </div>
    </div>
  </PageShell>;
}

function PartRow({ part, product, status, busy, canUpdate, canIssue, canReturn, onAction, onRemove }: { part: Backjob["parts"][number]; product?: ProductOption; status: string; busy: boolean; canUpdate: boolean; canIssue: boolean; canReturn: boolean; onAction: (name: string, payload?: Record<string, unknown>) => void; onRemove: () => void }) {
  const [quantity, setQuantity] = useState("1");
  const [used, setUsed] = useState(String(part.usedQuantity ?? 0));
  return <div className="rounded-md border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm">{part.productItemCode} · {part.productName}</strong><p className="text-xs text-muted-foreground">Planned {part.plannedQuantity} · issued {part.issuedQuantity} · used {part.usedQuantity ?? "unrecorded"} · returned {part.returnedQuantity} · available {product?.availableQuantity ?? 0}</p></div>{(status === "DRAFT" || status === "SCHEDULED") && part.issuedQuantity === 0 && canUpdate ? <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" />Remove</Button> : null}</div>{canIssue || canUpdate || canReturn ? <div className="mt-3 flex flex-wrap gap-2"><Input className="w-24" type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />{(status === "SCHEDULED" || status === "IN_PROGRESS") && canIssue ? <Button size="sm" disabled={busy || !product} onClick={() => onAction("issue-part", { partId: part.id, quantity: Number(quantity), balanceVersion: product?.balanceVersion })}><PackageMinus aria-hidden="true" />Issue</Button> : null}{status === "IN_PROGRESS" && canUpdate ? <><Input className="w-24" type="number" min="0" value={used} onChange={(e) => setUsed(e.target.value)} /><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction("reconcile-part", { partId: part.id, usedQuantity: Number(used) })}><ClipboardCheck aria-hidden="true" />Set used</Button></> : null}{status === "IN_PROGRESS" && canReturn ? <Button size="sm" variant="outline" disabled={busy || !product} onClick={() => onAction("return-part", { partId: part.id, quantity: Number(quantity), balanceVersion: product?.balanceVersion })}><Undo2 aria-hidden="true" />Return</Button> : null}</div> : null}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 whitespace-pre-wrap">{value}</div></div>; }
function Timeline({ title, meta, note }: { title: string; meta: string; note: string | null }) { return <div className="border-l-2 pl-3 text-sm"><strong>{title}</strong><div className="text-xs text-muted-foreground">{meta}</div>{note ? <p className="mt-1">{note}</p> : null}</div>; }
