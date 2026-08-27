"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PackageCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type OrderDetail = {
  id: string;
  orderNo: string;
  customer: string;
  branch: string;
  status: string;
  paymentStatus: string;
  downpayment: number;
  totalAmount: number;
  balance: number;
  orderDate: string;
  releaseDate: string;
  downpaymentReceiptNumber: string | null;
  finalReceiptNumber: string | null;
  notes: string | null;
  lines: Array<{ itemCode: string; name: string; quantity: number; unitPrice: number; amount: number }>;
};

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

async function fetchOrder(id: string) {
  const response = await fetch(`/api/customer-orders/${id}`, { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load order");
  return json.data as OrderDetail;
}

export default function CustomerOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const orderId = params.id;
  const { data: order, isLoading, error } = useQuery({ queryKey: ["customer-order", orderId], queryFn: () => fetchOrder(orderId), enabled: Boolean(orderId) });
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const note = window.prompt("Cancellation note") ?? "";
      const response = await fetch(`/api/customer-orders/${orderId}/cancel`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to cancel order");
      return json.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
    },
  });

  return (
    <PageShell
      title="Customer Order Details"
      subtitle="Review persisted order details, reserved items, payment status, and release readiness."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/customer-orders"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button></Link>
          {order && ["Reserved", "For Release"].includes(order.status) ? <Link href={`/customer-orders/${order.id}/release`}><Button className="bg-emerald-600 text-white hover:bg-emerald-700">Release Order</Button></Link> : null}
          {order && !["Released", "Cancelled"].includes(order.status) ? <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>{cancelMutation.isPending ? "Cancelling..." : "Cancel Order"}</Button> : null}
        </div>
      }
    >
      {isLoading ? <div className="flex items-center gap-2 rounded-xl border p-6 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading order...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(error as Error).message}</div> : null}
      {cancelMutation.error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(cancelMutation.error as Error).message}</div> : null}
      {order ? (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold">Order</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Order No." value={order.orderNo} />
                <Info label="Customer" value={order.customer} />
                <Info label="Branch" value={order.branch} />
                <Info label="Created" value={new Date(order.orderDate).toLocaleDateString("en-PH")} />
                <Info label="Planned Release" value={order.releaseDate ? new Date(order.releaseDate).toLocaleDateString("en-PH") : "Not set"} />
                <div><p className="text-sm text-slate-500">Status</p><Badge className="mt-1">{order.status}</Badge></div>
                <Info label="Downpayment Receipt" value={order.downpaymentReceiptNumber ?? "-"} />
                <Info label="Final Receipt" value={order.finalReceiptNumber ?? "-"} />
              </div>
              {order.notes ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{order.notes}</p> : null}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Item</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Qty</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Unit</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Amount</th></tr></thead>
                  <tbody>{order.lines.map((line) => <tr key={line.itemCode} className="border-b"><td className="px-4 py-3 text-sm">{line.itemCode} - {line.name}</td><td className="px-4 py-3 text-sm">{line.quantity}</td><td className="px-4 py-3 text-sm">{formatPeso(line.unitPrice)}</td><td className="px-4 py-3 text-sm font-medium">{formatPeso(line.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardContent className="space-y-4 p-5">
              <Summary label="Subtotal" value={formatPeso(order.totalAmount)} />
              <Summary label="Downpayment" value={formatPeso(order.downpayment)} />
              <Summary label="Remaining Balance" value={formatPeso(order.balance)} strong />
              <Summary label="Payment" value={order.paymentStatus} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "text-base font-semibold" : "text-sm"}`}><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}
