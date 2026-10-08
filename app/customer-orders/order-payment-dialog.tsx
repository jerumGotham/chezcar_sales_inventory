"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";

import { ReceiptPhotosInput, uploadReceiptPhotos } from "@/components/receipt-photos-input";
import { useCan } from "@/components/shell-access-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reactSelectStyles } from "@/lib/select-styles";

type SelectOption = { value: string; label: string };

const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: "CASH", label: "Cash" },
  { value: "GCASH", label: "GCash" },
  { value: "MAYA", label: "Maya" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CREDIT_CARD", label: "Credit Card" },
  { value: "SPLIT", label: "Split Payment" },
];

export type PaymentDialogOrder = {
  id: string;
  orderNo: string;
  customer: string;
  items: Array<{ name: string; quantity: number }>;
  totalAmount: number;
  downpayment: number;
  balance: number;
};

function peso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

/**
 * Records a downpayment or a later payment on a customer order, with its
 * receipt photo. Shared by the orders list and the order details page so both
 * collect money the same way. Mount it with a `key` per order so the form
 * starts empty for each one.
 */
export function OrderPaymentDialog({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: PaymentDialogOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const canAttachReceipt = useCan("sales:evidence:upload");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [method, setMethod] = useState<SelectOption>(PAYMENT_METHOD_OPTIONS[0]);

  const reset = () => {
    setAmount("");
    setReference("");
    setPhotos([]);
    setMethod(PAYMENT_METHOD_OPTIONS[0]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Select an order first.");
      const response = await fetch(`/api/customer-orders/${order.id}/payment`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), reference: reference.trim(), method: method.value }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to save payment");
      const saved = json.data as { paymentId: string | null };
      if (photos.length && canAttachReceipt && saved.paymentId) {
        // The money is already recorded, so a failed upload is a warning, not
        // a reason to report the payment as not saved.
        const paymentPath = `/api/accounting/payments/${encodeURIComponent(saved.paymentId)}`;
        const attached = await uploadReceiptPhotos(photos, { primary: `${paymentPath}/photo`, extras: `${paymentPath}/photos` });
        if (!attached) {
          return "Payment saved, but the receipt photo did not attach. Attach it from Receipt Verification.";
        }
      }
      return `Payment of ${peso(Number(amount))} recorded on ${order.orderNo}.`;
    },
    onSuccess: async (message) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order", order?.id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-order-receipts", order?.id] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
      ]);
      reset();
      onOpenChange(false);
      onSaved?.(message);
    },
  });

  const numericAmount = Number(amount);
  const balance = order?.balance ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        onOpenChange(next);
        if (!next) {
          reset();
          mutation.reset();
        }
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{order?.downpayment ? "Add Customer Payment" : "Record Downpayment"}</DialogTitle>
          <DialogDescription>
            {order?.downpayment
              ? "Add this payment to the order's existing downpayment."
              : "Record the customer's first payment for this order."}
          </DialogDescription>
        </DialogHeader>

        {/*
          Two columns from tablet width up: the order and the money on the
          left, the receipt photos on the right, so five pictures do not push
          the form into a long scroll.
        */}
        <div className="grid gap-6 py-2 md:grid-cols-2">
          <div className="grid content-start gap-4">
            <div className="space-y-2">
              <Label>Order No.</Label>
              <Input value={order?.orderNo ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label>Customer</Label>
              <Input value={order?.customer ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="rounded-lg border bg-muted p-3 text-sm text-foreground">
                <ul className="list-disc space-y-1 pl-5">
                  {order?.items.map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <p className="text-sm font-semibold">{peso(order?.totalAmount ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Current Downpayment</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{peso(order?.downpayment ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Remaining Balance</p>
                <p className="text-sm font-semibold text-amber-600">{peso(balance)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-payment-amount" required>Payment Amount</Label>
              <Input
                id="order-payment-amount"
                type="number"
                min="0.01"
                max={balance}
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-payment-reference" required>Receipt Number</Label>
              <Input
                id="order-payment-reference"
                placeholder="OR-000123"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                Accounting verifies this receipt against its photo, so every payment needs its own number.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-payment-method">Payment Method</Label>
              <Select
                inputId="order-payment-method"
                instanceId="customer-orders-payment-method"
                options={PAYMENT_METHOD_OPTIONS}
                value={method}
                onChange={(option) => setMethod(option ?? PAYMENT_METHOD_OPTIONS[0])}
                isSearchable
                placeholder="Select payment method"
                styles={reactSelectStyles}
              />
            </div>
          </div>
          <div className="grid content-start gap-4">
            {canAttachReceipt ? (
              <div className="space-y-2">
                <Label htmlFor="order-payment-photo">Receipt Photos (optional, up to 5)</Label>
                <ReceiptPhotosInput
                  id="order-payment-photo"
                  files={photos}
                  onChange={setPhotos}
                  disabled={mutation.isPending}
                  describedBy="order-payment-photo-help"
                />
                <p id="order-payment-photo-help" className="text-xs text-muted-foreground">
                  Click the photo to magnify it and check the figures are readable. Attach it now if you have the receipt, or leave it and attach it later in Receipt Verification.
                </p>
              </div>
            ) : null}
            {!canAttachReceipt ? <p className="text-sm text-muted-foreground">You do not have permission to attach receipt photos.</p> : null}
          </div>
        </div>
        {mutation.error ? <p className="text-sm text-red-600">{(mutation.error as Error).message}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || numericAmount <= 0 || numericAmount > balance || !reference.trim()}
          >
            {mutation.isPending ? "Saving..." : "Save Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
