"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, PackageCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan, useShellAccess } from "@/components/shell-access-context";
import { StatusBanner } from "@/components/status-banner";
import { Input } from "@/components/ui/input";
import { getCustomerOrderActions, type CustomerOrderStatusCode } from "@/lib/customer-order-actions";

type EditLine = {
  productId: string;
  itemCode: string;
  name: string;
  quantity: string;
  unitPrice: string;
};

type OrderDetail = {
  id: string;
  orderNo: string;
  customer: string;
  branch: string;
  salesperson: { personnelId: string; name: string; branch: { id: string; code: string; name: string } } | null;
  status: string;
  statusCode: CustomerOrderStatusCode;
  paymentStatus: string;
  downpayment: number;
  totalAmount: number;
  balance: number;
  orderDate: string;
  releaseDate: string;
  downpaymentReceiptNumber: string | null;
  finalReceiptNumber: string | null;
  notes: string | null;
  locationId: string;
  lines: Array<{ productId: string; itemCode: string; name: string; quantity: number; unitPrice: number; amount: number }>;
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
  const canEditLines = useCan("customer-orders:update");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editAck, setEditAck] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState("");
  const access = useShellAccess();
  const capabilities = access.authenticated ? access.capabilities : [];
  const orderId = params.id;
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellationNote, setCancellationNote] = useState("");
  const { data: order, isLoading, error } = useQuery({ queryKey: ["customer-order", orderId], queryFn: () => fetchOrder(orderId), enabled: Boolean(orderId) });

  /* The branch's catalogue, for adding a product the order did not have. */
  const productsQuery = useQuery({
    queryKey: ["order-edit-products", order?.locationId],
    enabled: isEditOpen && Boolean(order?.locationId),
    queryFn: async () => {
      const response = await fetch(
        `/api/customer-orders/options?locationId=${order!.locationId}&includeUnavailable=true`,
        { credentials: "same-origin" },
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load products");
      return json.data.products as Array<{ id: string; itemCode: string; name: string; price: number }>;
    },
  });

  const editedTotal = editLines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  /*
   * What the customer has already handed over, less anything given back. The
   * server works this out again; this only decides whether to ask for the
   * refund paperwork before the save is attempted.
   */
  const paidOnOrder = (order?.totalAmount ?? 0) - (order?.balance ?? 0);
  const handsMoneyBack = order ? editedTotal < paidOnOrder - 0.005 : false;

  const editMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/customer-orders/${orderId}/lines`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: editLines.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            finalUnitPrice: Number(line.unitPrice),
          })),
          ...(handsMoneyBack
            ? { acknowledgementNumber: editAck.trim(), note: editNote.trim() }
            : {}),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to save the changes");
      return json.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["customer-orders"] });
      setIsEditOpen(false);
      setEditError("");
    },
    onError: (saveError: Error) => setEditError(saveError.message),
  });

  const openEdit = () => {
    if (!order) return;
    setEditLines(order.lines.map((line) => ({
      productId: line.productId,
      itemCode: line.itemCode,
      name: line.name,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    })));
    setEditAck("");
    setEditNote("");
    setEditError("");
    setIsEditOpen(true);
  };
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/customer-orders/${orderId}/cancel`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: cancellationNote.trim() || undefined }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to cancel order");
      return json.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
      setIsCancelOpen(false);
      setCancellationNote("");
    },
  });
  const reserveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/customer-orders/${orderId}/reserve`, { method: "POST", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to reserve order");
      return json.data as OrderDetail;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
    },
  });
  const actions = order ? getCustomerOrderActions({ capabilities, statusCode: order.statusCode, downpayment: order.downpayment, balance: order.balance }) : null;

  return (
    <PageShell
      title="Customer Order Details"
      subtitle="Review persisted order details, reserved items, payment status, and release readiness."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/customer-orders?view=orders" className={buttonVariants({ variant: "outline" })}><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
          {order && actions?.canReserve ? <Button variant="workflow" onClick={() => reserveMutation.mutate()} disabled={reserveMutation.isPending}>{reserveMutation.isPending ? "Reserving..." : "Reserve Stock"}</Button> : null}
          {order && actions?.canRelease ? <Link href={`/customer-orders/${order.id}/release`} className={buttonVariants({ variant: "workflow" })}>Release Order</Link> : null}
          {order && actions?.canCancel ? <Button variant="destructive" onClick={() => setIsCancelOpen(true)}>Cancel Order</Button> : null}
        </div>
      }
    >
      {isLoading ? <div className="flex items-center gap-2 rounded-xl border p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading order...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(error as Error).message}</div> : null}
      {cancelMutation.error ? <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(cancelMutation.error as Error).message}</div> : null}
      {reserveMutation.error ? <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">{(reserveMutation.error as Error).message}</div> : null}
      {order ? (
        <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2"><PackageCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-semibold">Order</h3></div>
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Order No." value={order.orderNo} />
                <Info label="Customer" value={order.customer} />
                <Info label="Branch" value={order.branch} />
                <Info label="Salesperson" value={order.salesperson?.name ?? "Not recorded (legacy)"} />
                <Info label="Created" value={new Date(order.orderDate).toLocaleDateString("en-PH")} />
                <Info label="Planned Release" value={order.releaseDate ? new Date(order.releaseDate).toLocaleDateString("en-PH") : "Not set"} />
                <div><p className="text-sm text-muted-foreground">Status</p><Badge className="mt-1">{order.status}</Badge></div>
                <Info label="Downpayment Receipt" value={order.downpaymentReceiptNumber ?? "-"} />
                <Info label="Final Receipt" value={order.finalReceiptNumber ?? "-"} />
              </div>
              {order.notes ? <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-foreground">{order.notes}</p> : null}
              <div className="mt-6 flex items-center justify-between gap-3">
                <h2 className="font-semibold text-foreground">Items</h2>
                {canEditLines && ["RESERVED", "WAITING_STOCK", "READY_FOR_RELEASE"].includes(order.statusCode) ? (
                  <Button variant="view" size="sm" onClick={openEdit}>
                    Edit items
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-muted"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Item</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Qty</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Unit</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Amount</th></tr></thead>
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
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditError(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit items</DialogTitle>
            <DialogDescription>
              Change what is on this order while it is still unreleased. Stock is
              reserved or returned as you go.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((line, index) => (
                    <tr key={line.productId} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{line.name}</p>
                        <p className="text-xs text-muted-foreground">{line.itemCode}</p>
                      </td>
                      <td className="w-24 px-3 py-2">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(event) => setEditLines((current) => current.map((item, position) =>
                            position === index ? { ...item, quantity: event.target.value } : item))}
                        />
                      </td>
                      <td className="w-32 px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(event) => setEditLines((current) => current.map((item, position) =>
                            position === index ? { ...item, unitPrice: event.target.value } : item))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatPeso((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={editLines.length === 1}
                          onClick={() => setEditLines((current) => current.filter((_, position) => position !== index))}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1">
              <Label htmlFor="order-add-product">Add a product</Label>
              <select
                id="order-add-product"
                value=""
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                onChange={(event) => {
                  const product = productsQuery.data?.find((item) => item.id === event.target.value);
                  if (!product) return;
                  setEditLines((current) => current.some((line) => line.productId === product.id)
                    ? current
                    : [...current, {
                        productId: product.id,
                        itemCode: product.itemCode,
                        name: product.name,
                        quantity: "1",
                        unitPrice: String(product.price),
                      }]);
                }}
              >
                <option value="">
                  {productsQuery.isLoading ? "Loading products..." : "Choose a product to add"}
                </option>
                {(productsQuery.data ?? [])
                  .filter((product) => !editLines.some((line) => line.productId === product.id))
                  .map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.itemCode} - {product.name} ({formatPeso(product.price)})
                    </option>
                  ))}
              </select>
            </div>

            <div className="rounded-xl border bg-muted p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">New total</span><span className="font-semibold">{formatPeso(editedTotal)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Already paid</span><span>{formatPeso(paidOnOrder)}</span></div>
            </div>

            {/*
              Asked for only when the change hands money back, which is the one
              case the branch owes the customer a slip rather than a balance.
            */}
            {handsMoneyBack ? (
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  This returns {formatPeso(paidOnOrder - editedTotal)} to the customer.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="order-edit-ack">Acknowledgement number</Label>
                  <Input id="order-edit-ack" value={editAck} onChange={(event) => setEditAck(event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="order-edit-note">Reason</Label>
                  <Textarea id="order-edit-note" value={editNote} onChange={(event) => setEditNote(event.target.value)} />
                </div>
              </div>
            ) : null}

            {editError ? <StatusBanner tone="error">{editError}</StatusBanner> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              disabled={
                editMutation.isPending ||
                editLines.length === 0 ||
                editLines.some((line) => Number(line.quantity) <= 0 || Number(line.unitPrice) < 0) ||
                (handsMoneyBack && (!editAck.trim() || !editNote.trim()))
              }
              onClick={() => editMutation.mutate()}
            >
              {editMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelOpen} onOpenChange={(open) => {
        if (cancelMutation.isPending) return;
        setIsCancelOpen(open);
        if (!open) setCancellationNote("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel customer order?</DialogTitle>
            <DialogDescription>
              This changes the order status to Cancelled. Add a note for the order history; a note is required when cancelling an order with a downpayment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancellation-note">Cancellation note{order && order.downpayment > 0 ? " (required)" : ""}</Label>
            <Textarea
              id="cancellation-note"
              value={cancellationNote}
              onChange={(event) => setCancellationNote(event.target.value)}
              maxLength={1_000}
              placeholder="Reason for cancelling this order"
              rows={4}
            />
            {cancelMutation.error ? <p className="text-sm text-red-600">{(cancelMutation.error as Error).message}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelOpen(false)} disabled={cancelMutation.isPending}>Keep Order</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending || Boolean(order && order.downpayment > 0 && !cancellationNote.trim())}>{cancelMutation.isPending ? "Cancelling..." : "Cancel Order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-medium text-foreground">{value}</p></div>;
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "text-base font-semibold" : "text-sm"}`}><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
