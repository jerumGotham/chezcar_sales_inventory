"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Warranty = { id: string; reference: string; customerName: string; productName: string; claimQuantity: number; locationName: string; status: string; createdAt: string };

export function WarrantiesClient({ capabilities }: { capabilities: readonly string[] }) {
  const query = useQuery({ queryKey: ["customer-warranties"], queryFn: async () => { const response = await fetch("/api/customer-warranties?pageSize=50"); const json = await response.json(); if (!response.ok) throw new Error(json.error?.message ?? "Unable to load warranties"); return json.data as Warranty[]; } });
  return <PageShell title="Customer warranties" subtitle="Receive, assess, and release customer warranty items." actions={capabilities.includes("customer-warranties:create") ? <Link href="/inventory/returns-warranty/warranties/create" className={buttonVariants()}><Plus className="size-4" /> New claim</Link> : undefined}>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/50 text-left"><tr><th className="p-4">Reference</th><th className="p-4">Customer / item</th><th className="p-4">Location</th><th className="p-4">Status</th></tr></thead><tbody>
      {query.isLoading ? <tr><td className="p-6 text-muted-foreground" colSpan={4}>Loading warranties...</td></tr> : query.error ? <tr><td className="p-6 text-destructive" colSpan={4}>{query.error.message}</td></tr> : query.data?.length ? query.data.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-4 font-medium"><Link className="hover:underline" href={`/inventory/returns-warranty/warranties/${item.id}`}>{item.reference}</Link></td><td className="p-4"><div>{item.customerName}</div><div className="text-muted-foreground">{item.claimQuantity} x {item.productName}</div></td><td className="p-4">{item.locationName}</td><td className="p-4"><Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge></td></tr>) : <tr><td className="p-6 text-muted-foreground" colSpan={4}>No warranty claims found.</td></tr>}
    </tbody></table></div></CardContent></Card>
  </PageShell>;
}
