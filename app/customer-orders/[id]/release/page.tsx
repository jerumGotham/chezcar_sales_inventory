"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, PackageCheck } from "lucide-react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptPhotosInput, uploadReceiptPhotos } from "@/components/receipt-photos-input";
import { SortableHeader, useTableSort } from "@/components/sortable-header";
import { useCan, useShellAccess } from "@/components/shell-access-context";
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
  subtotal: number;
  discountAmount: number;
  releaseDate: string;
  locationId: string;
  salesperson: { personnelId: string; name: string; branch: { id: string; code: string; name: string } } | null;
  lines: Array<{ itemCode: string; name: string; quantity: number; amount: number }>;
};

/** The release form's typed values, copied out before React resets the form. */
type ReleaseInput = { finalReceiptNumber: string; paymentMethod: string; notes: string };

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
  const [salespersonId, setSalespersonId] = useState("");
  const lineSort = useTableSort(order?.lines, {
    item: (line) => line.itemCode,
    quantity: (line) => line.quantity,
    amount: (line) => line.amount,
  });
  /*
   * The paper receipt for the balance collected at release. Accounting verifies
   * the release sale against it, so it is asked for here rather than left for
   * someone to chase from Receipt Verification later.
   */
  const canAttachReceipt = useCan("sales:evidence:upload");
  const [receiptPhotos, setReceiptPhotos] = useState<File[]>([]);
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null);
  const needsReceiptPhoto = (order?.balance ?? 0) > 0 && canAttachReceipt;
  /*
   * Release moves stock out and posts a sale, and neither is undone by going
   * back a page, so the form is held until it is confirmed.
   *
   * The typed values are copied out rather than the FormData kept: React resets
   * the form once the action returns, and a retained FormData can come back
   * empty by the time the dialog is answered, which silently released nothing.
   */
  const [pendingRelease, setPendingRelease] = useState<ReleaseInput | null>(null);
  const salespersonQuery = useQuery({
    queryKey: ["customer-order-salespersons", order?.locationId],
    queryFn: async () => {
      const response = await fetch(`/api/customer-orders/options?locationId=${encodeURIComponent(order!.locationId)}&includeUnavailable=true`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load salespersons");
      return json.data.salespersons as Array<{ id: string; fullName: string }>;
    },
    enabled: Boolean(order?.locationId),
  });
  useEffect(() => {
    if (!order || !salespersonQuery.data) return;
    const currentIsValid = salespersonQuery.data.some((personnel) => personnel.id === order.salesperson?.personnelId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSalespersonId(currentIsValid ? order.salesperson!.personnelId : "");
  }, [order, salespersonQuery.data]);
  const releaseMutation = useMutation({
    mutationFn: async ({ finalReceiptNumber, paymentMethod, notes }: ReleaseInput) => {
      // A receipt records money received. Releasing an order that is already
      // paid in full takes none, so there is nothing to write a number on.
      const collectsMoney = (order?.balance ?? 0) > 0;
      if (collectsMoney && !finalReceiptNumber) throw new Error("Final receipt number is required.");
      if (needsReceiptPhoto && receiptPhotos.length === 0) throw new Error("Attach a photo of the final receipt.");
      if (!salespersonId) throw new Error("Select an active salesperson.");
      if (salespersonId !== order?.salesperson?.personnelId) {
        const attributionResponse = await fetch(`/api/customer-orders/${orderId}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salespersonId }),
        });
        const attributionJson = await attributionResponse.json();
        if (!attributionResponse.ok) throw new Error(attributionJson.error?.message ?? "Unable to update salesperson");
      }
      const response = await fetch(`/api/customer-orders/${orderId}/release`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(collectsMoney ? { finalReceiptNumber, paymentMethod } : {}),
          amountPaid: order?.balance ?? 0,
          notes: notes || undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to release order");
      if (collectsMoney && receiptPhotos.length && canAttachReceipt) {
        // The release is already posted, so a failed upload is a warning that
        // sends the branch to Receipt Verification, not a failed release.
        const attached = await attachReleaseReceipt(orderId, receiptPhotos).catch(() => false);
        if (!attached) return { photoAttached: false };
      }
      return { photoAttached: true };
    },
    onSuccess: async ({ photoAttached }) => {
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
      queryClient.invalidateQueries({ queryKey: ["customer-order-receipts", orderId] });
      // Stay on the page when the photo missed, so the warning is read.
      if (!photoAttached) {
        setReleaseNotice("Order released, but the receipt photo did not attach. Attach it from Receipt Verification.");
        return;
      }
      router.push(`/customer-orders/${orderId}`);
    },
  });
  const actions = order ? getCustomerOrderActions({ capabilities, statusCode: order.statusCode, downpayment: order.downpayment, balance: order.balance }) : null;

  return (
    <PageShell
      title="Release Customer Order"
      subtitle="Post final receipt, deduct reserved stock, and complete the customer order."
      actions={<Link href={`/customer-orders/${orderId}`} className={buttonVariants({ variant: "outline" })}><ArrowLeft className="mr-2 h-4 w-4" />Back to Order</Link>}
    >
      {isLoading ? <div className="flex items-center gap-2 rounded-xl border p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading order...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(error as Error).message}</div> : null}
      {releaseNotice ? <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">{releaseNotice}</div> : null}
      {releaseMutation.error ? <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(releaseMutation.error as Error).message}</div> : null}
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
                  <Info label="Salesperson" value={order.salesperson?.name ?? "Not recorded (legacy)"} />
                  <Info label="Planned Release" value={order.releaseDate ? new Date(order.releaseDate).toLocaleDateString("en-PH") : "Not set"} />
                  <div><p className="text-sm text-muted-foreground">Status</p><Badge className="mt-1">{order.status}</Badge></div>
                  <div><p className="text-sm text-muted-foreground">Payment</p><Badge className="mt-1">{order.paymentStatus}</Badge></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold">Items for Release</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[650px]">
                    <thead className="bg-muted"><tr><SortableHeader label="Item" sortKey="item" sort={lineSort.sort} onSort={lineSort.toggle} className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground" /><SortableHeader label="Quantity" sortKey="quantity" sort={lineSort.sort} onSort={lineSort.toggle} className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground" /><SortableHeader label="Amount" sortKey="amount" sort={lineSort.sort} onSort={lineSort.toggle} className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground" /></tr></thead>
                    <tbody>{lineSort.rows.map((item) => <tr key={item.itemCode} className="border-b"><td className="px-4 py-3 text-sm text-foreground">{item.itemCode} - {item.name}</td><td className="px-4 py-3 text-sm text-foreground">{item.quantity}</td><td className="px-4 py-3 text-sm font-medium text-foreground">{formatPeso(item.amount)}</td></tr>)}</tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="h-fit xl:sticky xl:top-24">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold">Release Summary</h3></div>
              <div className="space-y-4">
                <Summary label="Subtotal" value={formatPeso(order.subtotal)} />
                {order.discountAmount > 0 ? <Summary label="Discount" value={`-${formatPeso(order.discountAmount)}`} /> : null}
                <Summary label="Order total" value={formatPeso(order.totalAmount)} />
                <Summary label="Downpayment" value={formatPeso(order.downpayment)} />
                <Summary label="Remaining Balance" value={formatPeso(order.balance)} strong />
              </div>
              {actions?.canRelease ? <form className="mt-6 space-y-4" action={(formData) => setPendingRelease({
                finalReceiptNumber: String(formData.get("finalReceiptNumber") ?? "").trim(),
                paymentMethod: String(formData.get("paymentMethod") ?? "CASH"),
                notes: String(formData.get("notes") ?? "").trim(),
              })}>
                <div className="space-y-2"><Label htmlFor="salespersonId" required>Salesperson</Label><select id="salespersonId" value={salespersonId} onChange={(event) => setSalespersonId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required><option value="">Select salesperson</option>{salespersonQuery.data?.map((personnel) => <option key={personnel.id} value={personnel.id}>{personnel.fullName}</option>)}</select>{salespersonQuery.data?.length === 0 ? <p className="text-xs text-amber-700 dark:text-amber-300">No eligible Salesperson is available in your authorized locations.</p> : null}</div>
                {order.balance > 0 ? (
                  <div className="space-y-2"><Label htmlFor="finalReceiptNumber" required>Final Receipt Number</Label><Input id="finalReceiptNumber" name="finalReceiptNumber" placeholder="Handwritten receipt number" /></div>
                ) : (
                  <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground" role="status">
                    This order is paid in full, so releasing it collects nothing and issues no receipt. The goods still leave the branch and the sale is recorded against {order.orderNo}.
                  </div>
                )}
                {needsReceiptPhoto ? (
                  <div className="space-y-2">
                    <Label htmlFor="finalReceiptPhoto" required>Final Receipt Photo</Label>
                    <ReceiptPhotosInput id="finalReceiptPhoto" files={receiptPhotos} onChange={setReceiptPhotos} disabled={releaseMutation.isPending} required describedBy="finalReceiptPhotoHelp" />
                    <p id="finalReceiptPhotoHelp" className="text-xs text-muted-foreground">Click the photo to magnify it and check the receipt number and amount are readable.</p>
                  </div>
                ) : null}
                {order.balance > 0 ? (
                  <div className="space-y-2"><Label htmlFor="paymentMethod">Payment Method</Label><select id="paymentMethod" name="paymentMethod" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="MAYA">Maya</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CREDIT_CARD">Credit Card</option><option value="SPLIT">Split</option></select></div>
                ) : null}
                <div className="space-y-2"><Label htmlFor="notes">Release Notes</Label><Input id="notes" name="notes" placeholder="Released by, remarks, etc." /></div>
                <Button type="submit" variant="workflow" className="w-full" disabled={releaseMutation.isPending || salespersonQuery.isLoading || !salespersonId || (needsReceiptPhoto && receiptPhotos.length === 0)}>{releaseMutation.isPending ? "Releasing..." : "Confirm Release"}</Button>
              </form> : <p className="mt-6 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">This order cannot be released in its current state or with your capabilities.</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <ConfirmationDialog
        open={pendingRelease !== null}
        title="Release this order?"
        description={order
          ? `${order.lines.reduce((sum, line) => sum + line.quantity, 0)} unit(s) will leave ${order.branch} and a sale will be posted against ${order.customer}. ` +
            (order.balance > 0
              ? `${formatPeso(order.balance)} is collected now against the receipt you entered.`
              : "The order is paid in full, so nothing is collected and no receipt is issued.") +
            " Stock and the posted sale cannot be undone from here."
          : ""}
        confirmLabel="Release order"
        onConfirm={() => {
          const input = pendingRelease;
          setPendingRelease(null);
          if (input) releaseMutation.mutate(input);
        }}
        onOpenChange={(next) => { if (!next) setPendingRelease(null); }}
      />
    </PageShell>
  );
}

/*
 * The release posts a sale, and its receipt is evidenced on that sale. The
 * order's receipt list names the sale behind the final payment.
 */
async function attachReleaseReceipt(orderId: string, photos: File[]) {
  const listResponse = await fetch(`/api/customer-orders/${orderId}/payments`, { credentials: "same-origin" });
  if (!listResponse.ok) return false;
  const list = (await listResponse.json()) as { data: { payments: Array<{ kind: string; saleId: string | null }> } };
  const saleId = list.data.payments.find((payment) => payment.kind === "ORDER_FINAL" && payment.saleId)?.saleId;
  if (!saleId) return false;
  const salePath = `/api/accounting/receipts/${encodeURIComponent(saleId)}`;
  return uploadReceiptPhotos(photos, { primary: `${salePath}/photo`, extras: `${salePath}/photos` });
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "text-base font-semibold" : "text-sm"}`}><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
