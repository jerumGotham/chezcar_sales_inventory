"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, PackageCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShellAccess } from "@/components/shell-access-context";
import { getCustomerOrderActions, type CustomerOrderStatusCode } from "@/lib/customer-order-actions";

type OrderDetail = {
  id: string;
  orderNo: string;
  customer: string;
  branch: string;
  status: string;
  statusCode: CustomerOrderStatusCode;
  paymentStatus: string;
  totalAmount: number;
  downpayment: number;
  balance: number;
  releaseDate: string;
  lines: Array<{ itemCode: string; name: string; quantity: number; amount: number }>;
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

export default function ReleaseCustomerOrderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useShellAccess();
  const capabilities = access.authenticated ? access.capabilities : [];
  const orderId = params.id;
  const { data: order, isLoading, error } = useQuery({ queryKey: ["customer-order", orderId], queryFn: () => fetchOrder(orderId), enabled: Boolean(orderId) });
  const releaseMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const finalReceiptNumber = String(formData.get("finalReceiptNumber") ?? "").trim();
      if (!finalReceiptNumber) throw new Error("Final receipt number is required.");
      const response = await fetch(`/api/customer-orders/${orderId}/release`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalReceiptNumber, amountPaid: order?.balance ?? 0, paymentMethod: String(formData.get("paymentMethod") ?? "CASH"), notes: String(formData.get("notes") ?? "").trim() || undefined }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to release order");
      return json.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-direct-sales-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
      router.push(`/customer-orders/${orderId}`);
    },
  });
  const actions = order ? getCustomerOrderActions({ capabilities, statusCode: order.statusCode, downpayment: order.downpayment, balance: order.balance }) : null;

  return (
    <PageShell
      title="Release Customer Order"
      subtitle="Post final receipt, deduct reserved stock, and complete the customer order."
      actions={<Link href={`/customer-orders/${orderId}`}><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" />Back to Order</Button></Link>}
    >
      {isLoading ? <div className="flex items-center gap-2 rounded-xl border p-6 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading order...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(error as Error).message}</div> : null}
      {releaseMutation.error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(releaseMutation.error as Error).message}</div> : null}
      {order ? (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-6">
            <Card>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold">Order to Release</h3></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Info label="Order No." value={order.orderNo} />
                  <Info label="Customer" value={order.customer} />
                  <Info label="Branch" value={order.branch} />
                  <Info label="Planned Release" value={order.releaseDate ? new Date(order.releaseDate).toLocaleDateString("en-PH") : "Not set"} />
                  <div><p className="text-sm text-slate-500">Status</p><Badge className="mt-1">{order.status}</Badge></div>
                  <div><p className="text-sm text-slate-500">Payment</p><Badge className="mt-1">{order.paymentStatus}</Badge></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold">Items for Release</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[650px]">
                    <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Item</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Quantity</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">Amount</th></tr></thead>
                    <tbody>{order.lines.map((item) => <tr key={item.itemCode} className="border-b"><td className="px-4 py-3 text-sm text-slate-700">{item.itemCode} - {item.name}</td><td className="px-4 py-3 text-sm text-slate-700">{item.quantity}</td><td className="px-4 py-3 text-sm font-medium text-slate-800">{formatPeso(item.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="h-fit xl:sticky xl:top-24">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold">Release Summary</h3></div>
              <div className="space-y-4">
                <Summary label="Subtotal" value={formatPeso(order.totalAmount)} />
                <Summary label="Downpayment" value={formatPeso(order.downpayment)} />
                <Summary label="Remaining Balance" value={formatPeso(order.balance)} strong />
              </div>
              {actions?.canRelease ? <form className="mt-6 space-y-4" action={(formData) => releaseMutation.mutate(formData)}>
                <div className="space-y-2"><Label htmlFor="finalReceiptNumber">Final Receipt Number</Label><Input id="finalReceiptNumber" name="finalReceiptNumber" placeholder="Handwritten receipt number" /></div>
                <div className="space-y-2"><Label htmlFor="paymentMethod">Payment Method</Label><select id="paymentMethod" name="paymentMethod" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="MAYA">Maya</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CREDIT_CARD">Credit Card</option><option value="SPLIT">Split</option></select></div>
                <div className="space-y-2"><Label htmlFor="notes">Release Notes</Label><Input id="notes" name="notes" placeholder="Released by, remarks, etc." /></div>
                <Button type="submit" className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={releaseMutation.isPending}>{releaseMutation.isPending ? "Releasing..." : "Confirm Release"}</Button>
              </form> : <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This order cannot be released in its current state or with your capabilities.</p>}
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
