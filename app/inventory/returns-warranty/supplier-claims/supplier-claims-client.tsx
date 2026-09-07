"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Claim = { id: string; reference: string; supplierName: string; locationName: string; status: string; reason: string; createdAt: string; lines: Array<{ claimedQuantity: number }> };
export function SupplierClaimsClient() {
  const query = useQuery({ queryKey: ["supplier-claims"], queryFn: async () => { const response = await fetch("/api/supplier-claims?pageSize=50"); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load supplier claims"); return json.data as Claim[]; } });
  return <PageShell title="Supplier claims" subtitle="Supplier Damage claims from receiving discrepancies and warranty escalation."><Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-4">Reference</th><th className="p-4">Supplier</th><th className="p-4">Location</th><th className="p-4">Qty</th><th className="p-4">Status</th></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={5} className="p-6 text-muted-foreground">Loading claims...</td></tr> : query.error ? <tr><td colSpan={5} className="p-6 text-destructive">{query.error.message}</td></tr> : query.data?.length ? query.data.map((claim) => <tr key={claim.id} className="border-b last:border-0"><td className="p-4 font-medium"><Link className="hover:underline" href={`/inventory/returns-warranty/supplier-claims/${claim.id}`}>{claim.reference}</Link><div className="text-xs text-muted-foreground">Supplier Damage</div></td><td className="p-4">{claim.supplierName}</td><td className="p-4">{claim.locationName}</td><td className="p-4">{claim.lines.reduce((sum, line) => sum + line.claimedQuantity, 0)}</td><td className="p-4"><Badge variant="outline">{claim.status.replaceAll("_", " ")}</Badge></td></tr>) : <tr><td colSpan={5} className="p-6 text-muted-foreground">No supplier claims found. Affected receipts create drafts automatically.</td></tr>}</tbody></table></div></CardContent></Card></PageShell>;
}
