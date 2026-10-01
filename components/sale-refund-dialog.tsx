"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";

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
import { StatusBanner } from "@/components/status-banner";
import { Textarea } from "@/components/ui/textarea";
import { reactSelectStyles } from "@/lib/select-styles";
import {
  REFUND_DISPOSITION_OPTIONS,
  type RefundDispositionDto,
  type SaleRefundableDto,
} from "@/lib/contracts/refunds";

type BranchOption = { value: string; label: string };

const SCOPE_OPTIONS = [
  { value: "FULL" as const, label: "Everything - return the whole sale" },
  { value: "PARTIAL" as const, label: "Only some items came back" },
];

function peso(value: number) {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Handing money back on a posted sale. The dialog reads what the sale has left
 * to give — earlier refunds already subtracted — so a second refund cannot
 * return the same unit twice. The server re-checks all of it.
 */
export function SaleRefundDialog({
  saleId,
  open,
  onOpenChange,
  canChooseBranch,
  onRefunded,
}: {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Says what was handed back, so the page can confirm it to the reader. */
  onRefunded?: (message: string) => void;
  /**
   * Only an all-branch user may land a return somewhere other than the selling
   * branch, which is what the server enforces, so only they are offered it.
   */
  canChooseBranch: boolean;
}) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<"FULL" | "PARTIAL">("FULL");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dispositions, setDispositions] = useState<Record<string, RefundDispositionDto>>({});
  const [fullDisposition, setFullDisposition] = useState<RefundDispositionDto>("RESELLABLE");
  const [stockLocationId, setStockLocationId] = useState<string>("");
  const [acknowledgement, setAcknowledgement] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const refundableQuery = useQuery({
    queryKey: ["sale-refundable", saleId],
    enabled: open && Boolean(saleId),
    queryFn: async () => {
      const response = await fetch(`/api/sales/${saleId}/refund`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to read this sale");
      return json.data as SaleRefundableDto;
    },
  });

  const branchesQuery = useQuery({
    queryKey: ["refund-branches"],
    enabled: open && canChooseBranch,
    queryFn: async () => {
      const response = await fetch("/api/customer-orders/options", { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load branches");
      return (json.data.branches as Array<{ id: string; code: string; name: string }>).map(
        (branch): BranchOption => ({ value: branch.id, label: `${branch.code} - ${branch.name}` }),
      );
    },
  });
  const branches = branchesQuery.data ?? [];

  const sale = refundableQuery.data;

  const partialLines = useMemo(() => {
    if (!sale) return [];
    return sale.lines
      .map((line) => ({
        ...line,
        requested: Number(quantities[line.productId] ?? "0"),
        disposition: dispositions[line.productId] ?? "RESELLABLE",
      }))
      .filter((line) => line.requested > 0);
  }, [sale, quantities, dispositions]);

  // What the customer gets back, with the sale's discount already spread across
  // the lines, so the figure on screen is the figure the server will record.
  const estimate = useMemo(() => {
    if (!sale) return 0;
    if (scope === "FULL") return sale.refundableAmount;
    const subtotal = sale.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    if (subtotal <= 0) return 0;
    const gross = partialLines.reduce((sum, line) => sum + line.unitPrice * line.requested, 0);
    return Math.round(((gross * sale.totalAmount) / subtotal) * 100) / 100;
  }, [sale, scope, partialLines]);

  const overReturned = partialLines.some((line) => line.requested > line.returnableQuantity);
  const canSubmit =
    Boolean(sale) &&
    Boolean(acknowledgement.trim()) &&
    Boolean(reason.trim()) &&
    estimate > 0 &&
    !overReturned &&
    (scope === "FULL" || partialLines.length > 0);

  // Cleared when the dialog closes rather than in an effect, so one sale's
  // half-typed quantities never appear on the next.
  function closeAndReset() {
    setScope("FULL");
    setQuantities({});
    setDispositions({});
    setFullDisposition("RESELLABLE");
    setStockLocationId("");
    setAcknowledgement("");
    setReason("");
    setError("");
    onOpenChange(false);
  }

  const refundMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sales/${saleId}/refund`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          lines: scope === "PARTIAL"
            ? partialLines.map((line) => ({
                productId: line.productId,
                quantity: line.requested,
                disposition: line.disposition,
              }))
            : [],
          disposition: fullDisposition,
          stockLocationId: stockLocationId || undefined,
          acknowledgementNumber: acknowledgement.trim(),
          reason: reason.trim(),
          refundMethod: "CASH",
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to record the refund");
      return json.data;
    },
    onSuccess: async (refund: { reference: string; amount: number; lines: Array<{ quantity: number }> }) => {
      const returned = refund.lines.reduce((sum, line) => sum + line.quantity, 0);
      onRefunded?.(
        `${peso(refund.amount)} refunded on ${sale?.reference ?? "this sale"}` +
          (returned > 0 ? `, ${returned} item(s) back in stock` : ", nothing returned") +
          ". Sales are reduced by this amount, dated today.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["direct-sales"] }),
        queryClient.invalidateQueries({ queryKey: ["sale-refundable", saleId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["pos-options"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      closeAndReset();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (refundMutation.isPending) return; if (next) onOpenChange(true); else closeAndReset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Refund this sale</DialogTitle>
          <DialogDescription>
            {sale
              ? `${sale.reference} · ${sale.customer} · ${sale.branch}`
              : "Reading what this sale can still give back..."}
          </DialogDescription>
        </DialogHeader>

        {refundableQuery.isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading...</p>
        ) : refundableQuery.error ? (
          <StatusBanner tone="error">{(refundableQuery.error as Error).message}</StatusBanner>
        ) : sale ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Customer paid</p>
                <p className="text-sm font-semibold text-foreground">{peso(sale.amountPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Already refunded</p>
                <p className="text-sm font-semibold text-foreground">{peso(sale.alreadyRefunded)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Still refundable</p>
                <p className="text-sm font-semibold text-foreground">{peso(sale.refundableAmount)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-scope">What is coming back?</Label>
              <Select
                inputId="refund-scope"
                instanceId="refund-scope"
                options={SCOPE_OPTIONS}
                value={SCOPE_OPTIONS.find((option) => option.value === scope) ?? null}
                onChange={(option) => setScope(option?.value ?? "FULL")}
                isSearchable={false}
                styles={reactSelectStyles as never}
              />
            </div>

            {scope === "FULL" ? (
              <div className="space-y-2">
                <Label htmlFor="refund-full-disposition">Where do the returned items go?</Label>
                <Select
                  inputId="refund-full-disposition"
                  instanceId="refund-full-disposition"
                  options={REFUND_DISPOSITION_OPTIONS}
                  value={REFUND_DISPOSITION_OPTIONS.find((option) => option.value === fullDisposition) ?? null}
                  onChange={(option) => setFullDisposition(option?.value ?? "RESELLABLE")}
                  isSearchable={false}
                  styles={reactSelectStyles as never}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Items returned</Label>
                <div className="space-y-2">
                  {sale.lines.map((line) => (
                    <div key={line.productId} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_7rem_14rem]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {line.itemCode} · {peso(line.unitPrice)} each
                        </p>
                        {/* "sold 3" is the receipt and never changes. What the
                            cashier actually needs is how many may still come
                            back, said outright rather than left as a
                            subtraction they have to do in their head. */}
                        {line.returnableQuantity === 0 ? (
                          <p className="text-xs font-medium text-muted-foreground">
                            All {line.quantity} already returned
                          </p>
                        ) : line.alreadyReturned > 0 ? (
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            {line.returnableQuantity} of {line.quantity} still returnable
                            <span className="font-normal text-muted-foreground">
                              {" "}· {line.alreadyReturned} already returned
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            sold {line.quantity} · all still returnable
                          </p>
                        )}
                      </div>
                      <div>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          max={line.returnableQuantity}
                          placeholder={line.returnableQuantity === 0 ? "0" : `max ${line.returnableQuantity}`}
                          aria-label={`Units of ${line.name} returned, at most ${line.returnableQuantity}`}
                          disabled={line.returnableQuantity === 0}
                          value={quantities[line.productId] ?? ""}
                          onChange={(event) =>
                            setQuantities((current) => ({ ...current, [line.productId]: event.target.value }))
                          }
                        />
                      </div>
                      <Select
                        inputId={`refund-disposition-${line.productId}`}
                        instanceId={`refund-disposition-${line.productId}`}
                        aria-label={`Where the returned ${line.name} goes`}
                        options={REFUND_DISPOSITION_OPTIONS}
                        value={
                          REFUND_DISPOSITION_OPTIONS.find(
                            (option) => option.value === (dispositions[line.productId] ?? "RESELLABLE"),
                          ) ?? null
                        }
                        onChange={(option) =>
                          setDispositions((current) => ({
                            ...current,
                            [line.productId]: option?.value ?? "RESELLABLE",
                          }))
                        }
                        isDisabled={!Number(quantities[line.productId] ?? "0")}
                        isSearchable={false}
                        styles={reactSelectStyles as never}
                      />
                    </div>
                  ))}
                </div>
                {overReturned ? (
                  <StatusBanner tone="error">
                    One item is more than what is left to return.
                  </StatusBanner>
                ) : null}
              </div>
            )}

            {/* A customer may hand goods back at whichever shop is nearest, so a
                user who can reach several branches picks where they land. */}
            {canChooseBranch && branches.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="refund-stock-branch">Branch receiving the returned stock</Label>
                <Select
                  inputId="refund-stock-branch"
                  instanceId="refund-stock-branch"
                  options={branches}
                  value={branches.find((option) => option.value === (stockLocationId || sale.branchId)) ?? null}
                  onChange={(option) => setStockLocationId(option?.value ?? "")}
                  styles={reactSelectStyles as never}
                />
                <p className="text-xs text-muted-foreground">
                  Sales are reduced at {sale.branch}, which recorded the money. Only the stock moves here.
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="refund-ack">Acknowledgement slip no.</Label>
                <Input
                  id="refund-ack"
                  value={acknowledgement}
                  maxLength={100}
                  onChange={(event) => setAcknowledgement(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refund-estimate">Amount handed back</Label>
                <Input id="refund-estimate" value={peso(estimate)} readOnly disabled />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea
                id="refund-reason"
                rows={3}
                maxLength={1_000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why is this money going back?"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Sales fall by {peso(estimate)}, dated today. The original receipt stays as it was, so a period
              already reported does not change.
            </p>

            {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={closeAndReset} disabled={refundMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => { setError(""); refundMutation.mutate(); }}
            disabled={!canSubmit || refundMutation.isPending}
          >
            {refundMutation.isPending ? "Recording..." : `Refund ${peso(estimate)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
