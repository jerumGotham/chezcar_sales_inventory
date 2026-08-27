"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Customer = { id: string };
type CustomerHistory = {
  customer: { notes?: string | null };
  sales: Array<{ reference: string; receiptNumber: string; date: string; branch: string; total: number; paymentMethod: string; lines: Array<{ name: string; quantity: number }> }>;
  orders: Array<{ reference: string; date: string; branch: string; status: string; total: number; downpayment: number; remaining: number; releaseDate: string | null; lines: Array<{ name: string; quantity: number }> }>;
};

async function fetchHistory(id: string) {
  const response = await fetch(`/api/customers/${id}`, { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load customer history");
  return json.data as CustomerHistory;
}

function peso(value: number) {
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export default function CustomerHistoryTabs({ customer }: { customer: Customer }) {
  const historyQuery = useQuery({ queryKey: ["customer-history", customer.id], queryFn: () => fetchHistory(customer.id) });
  const history = historyQuery.data;

  if (historyQuery.isLoading) return <Card><CardContent className="p-5 text-sm text-slate-500">Loading transaction history...</CardContent></Card>;
  if (historyQuery.isError) return <Card><CardContent className="p-5 text-sm text-red-600">{(historyQuery.error as Error).message}</CardContent></Card>;

  return (
    <Tabs defaultValue="sales" className="flex h-full min-h-0 flex-col">
      <TabsList className="grid h-auto w-full grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
        <TabsTrigger value="sales">Sales ({history?.sales.length ?? 0})</TabsTrigger>
        <TabsTrigger value="orders">Orders ({history?.orders.length ?? 0})</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="sales" className="mt-4 space-y-3">
        {history?.sales.length ? history.sales.map((sale) => <Card key={sale.reference}><CardContent className="space-y-2 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{sale.reference}</p><p className="font-semibold text-emerald-700">{peso(sale.total)}</p></div><p className="text-sm text-slate-500">{sale.date.slice(0, 10)} • {sale.branch} • {sale.paymentMethod}</p><p className="text-sm">{sale.lines.map((line) => `${line.name} x${line.quantity}`).join(", ")}</p></CardContent></Card>) : <Empty text="No completed sales yet." />}
      </TabsContent>
      <TabsContent value="orders" className="mt-4 space-y-3">
        {history?.orders.length ? history.orders.map((order) => <Card key={order.reference}><CardContent className="space-y-2 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{order.reference}</p><Badge>{order.status.replaceAll("_", " ")}</Badge></div><p className="text-sm text-slate-500">{order.date.slice(0, 10)} • {order.branch}</p><p className="text-sm">{order.lines.map((line) => `${line.name} x${line.quantity}`).join(", ")}</p><p className="text-sm text-slate-600">Total {peso(order.total)} • Downpayment {peso(order.downpayment)} • Balance {peso(order.remaining)}</p></CardContent></Card>) : <Empty text="No customer orders yet." />}
      </TabsContent>
      <TabsContent value="notes" className="mt-4"><Card><CardContent className="p-5"><p className="whitespace-pre-wrap text-sm text-slate-600">{history?.customer.notes || "No notes recorded."}</p></CardContent></Card></TabsContent>
    </Tabs>
  );
}

function Empty({ text }: { text: string }) {
  return <Card className="border-dashed"><CardContent className="p-5 text-sm text-slate-500">{text}</CardContent></Card>;
}
