"use client";

import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { useCan } from "@/components/shell-access-context";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BackjobItemDto } from "@/lib/contracts/backjobs";

type Row = { id: string; reference: string; status: string; coverage: string; customerName: string; locationCode: string; items: BackjobItemDto[]; scheduledFor: string | null; createdAt: string };
type Page = { data: Row[]; meta: { total: number } };

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
  return body as T;
}

export function BackjobsClient() {
  const canCreate = useCan("backjobs:create");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const deferredSearch = useDeferredValue(search);
  const query = useQuery({ queryKey: ["backjobs", deferredSearch, status], queryFn: () => request<Page>(`/api/backjobs?search=${encodeURIComponent(deferredSearch)}&status=${status}&pageSize=100`) });

  return <PageShell title="Backjobs" subtitle="Returns, warranty work, schedules, and parts reconciliation" actions={canCreate ? <Link className={buttonVariants()} href="/inventory/returns-warranty/new"><Plus aria-hidden="true" />New Backjob</Link> : undefined}>
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <Input className="sm:max-w-sm" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, customer, receipt, or item" />
      <select className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
        {["ALL", "DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"].map((item) => <option key={item}>{item}</option>)}
      </select>
    </div>
    {query.isLoading ? <p className="text-sm text-muted-foreground">Loading Backjobs...</p> : null}
    {query.error ? <p className="text-sm text-destructive">{query.error.message}</p> : null}
    <div className="grid gap-3">
      {query.data?.data.map((row) => <Link key={row.id} href={`/inventory/returns-warranty/${row.id}`}>
        <Card className="transition-colors hover:bg-muted/40"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{row.reference}</strong><Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">{row.coverage}</Badge></div><p className="mt-1 text-sm">{row.customerName}</p><ul className="mt-1 space-y-1 text-sm text-muted-foreground">{row.items.map((item) => <li key={item.id} className="break-words">{item.productItemCode ? `${item.productItemCode} - ` : ""}{item.productName}</li>)}</ul></div>
          <div className="text-sm text-muted-foreground sm:text-right"><div>{row.locationCode}</div><div>{row.scheduledFor ? new Date(row.scheduledFor).toLocaleString() : "Not scheduled"}</div></div>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </CardContent></Card>
      </Link>)}
      {query.data?.data.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No Backjobs match these filters.</CardContent></Card> : null}
    </div>
  </PageShell>;
}
