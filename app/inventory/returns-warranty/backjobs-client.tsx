"use client";

import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Row = { id: string; reference: string; status: string; coverage: string; customerName: string; locationCode: string; affectedProductName: string | null; legacyProductDescription: string | null; scheduledFor: string | null; createdAt: string };
type Page = { data: Row[]; meta: { total: number } };

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
  return body as T;
}

export function BackjobsClient({ capabilities }: { capabilities: readonly string[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const deferredSearch = useDeferredValue(search);
  const query = useQuery({ queryKey: ["backjobs", deferredSearch, status], queryFn: () => request<Page>(`/api/backjobs?search=${encodeURIComponent(deferredSearch)}&status=${status}&pageSize=100`) });

  return <PageShell title="Backjobs" subtitle="Returns, warranty work, schedules, and parts reconciliation">
    <div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary">Backjobs</Button>{capabilities.includes("customer-warranties:view") ? <Link className={buttonVariants({ variant: "outline" })} href="/inventory/returns-warranty/warranties">Customer Warranty</Link> : null}{capabilities.includes("supplier-claims:view") ? <Link className={buttonVariants({ variant: "outline" })} href="/inventory/returns-warranty/supplier-claims">Supplier Claims</Link> : null}</div>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <Input className="sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, customer, receipt, or item" />
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
        {["ALL", "DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"].map((item) => <option key={item}>{item}</option>)}
      </select>
      <Link className={`${buttonVariants()} sm:ml-auto`} href="/inventory/returns-warranty/new">New Backjob</Link>
    </div>
    {query.isLoading ? <p className="text-sm text-muted-foreground">Loading Backjobs...</p> : null}
    {query.error ? <p className="text-sm text-destructive">{query.error.message}</p> : null}
    <div className="grid gap-3">
      {query.data?.data.map((row) => <Link key={row.id} href={`/inventory/returns-warranty/${row.id}`}>
        <Card className="transition-colors hover:bg-muted/40"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{row.reference}</strong><Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">{row.coverage}</Badge></div><p className="mt-1 truncate text-sm">{row.customerName} · {row.affectedProductName ?? row.legacyProductDescription}</p></div>
          <div className="text-sm text-muted-foreground sm:text-right"><div>{row.locationCode}</div><div>{row.scheduledFor ? new Date(row.scheduledFor).toLocaleString() : "Not scheduled"}</div></div>
        </CardContent></Card>
      </Link>)}
      {query.data?.data.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No Backjobs match these filters.</CardContent></Card> : null}
    </div>
  </PageShell>;
}
