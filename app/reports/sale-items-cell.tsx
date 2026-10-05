"use client";

import { useState } from "react";
import { Car, PackageOpen } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SalesReport } from "@/lib/contracts/reports";

type Row = SalesReport["rows"][number];
type Item = Row["items"][number];

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

/**
 * A row's goods, kept out of the table. Several items stacked inside one cell
 * made every row a different height and pushed the money columns off screen, so
 * the cell says how many there are and the detail opens on its own.
 */
export function SaleItemsCell({ row }: { row: Row }) {
  const [open, setOpen] = useState(false);

  if (row.items.length === 0) {
    return <span className="text-muted-foreground">Not recorded</span>;
  }

  const count = row.items.length;
  const units = row.items.reduce((sum, item) => sum + Math.abs(item.quantity), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-[16rem] items-center gap-1.5 whitespace-nowrap text-left text-sm font-medium text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <PackageOpen aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">
          {count === 1 ? row.items[0].name : `${count} items`}
          <span className="text-muted-foreground"> ({units} unit{units === 1 ? "" : "s"})</span>
        </span>
      </button>
      {row.itemsPending ? (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">On order, not yet released</p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receipt {row.manualReceiptNumber}</DialogTitle>
            <DialogDescription>
              {row.source} · {row.branch} · {row.customer}
              {row.itemsPending ? " · on order, not yet released" : ""}
            </DialogDescription>
          </DialogHeader>
          <ItemTable items={row.items} total={row.totalAmount} discountAmount={row.discountAmount} pending={row.itemsPending} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ItemTable({ items, total, discountAmount, pending }: { items: Item[]; total: number; discountAmount: number; pending: boolean }) {
  // Only worth a column when at least one line was actually discounted.
  const anyDiscount = items.some((item) => item.discount > 0);
  const goods = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              {anyDiscount ? <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">List price</th> : null}
              {anyDiscount ? <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discount</th> : null}
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit price</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.itemCode} className="border-t">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.itemCode}</p>
                  {/* What the part fits, so a receipt can be matched to a
                      vehicle without opening the product. */}
                  {item.fitment.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {item.fitment.map((vehicle) => (
                        <li key={vehicle} className="text-xs text-muted-foreground">
                          <Car aria-hidden="true" className="mr-1 inline size-3 align-[-2px]" />
                          {vehicle}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                {anyDiscount ? (
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {item.listPrice > 0 ? peso.format(item.listPrice) : "-"}
                  </td>
                ) : null}
                {anyDiscount ? (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.discount > 0 ? `-${peso.format(item.discount)}` : "-"}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right tabular-nums">{peso.format(item.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{peso.format(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          {/* On a downpayment the goods are the order's, not this receipt's. */}
          <dt className="text-muted-foreground">{pending ? "Value of the order" : "Goods on this receipt"}</dt>
          <dd className="tabular-nums">{peso.format(goods)}</dd>
        </div>
        {discountAmount > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Discount on the receipt</dt>
            <dd className="tabular-nums">-{peso.format(discountAmount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t pt-1 font-medium">
          <dt>{pending ? "Collected on this receipt" : "Amount on this receipt"}</dt>
          <dd className="tabular-nums">{peso.format(total)}</dd>
        </div>
      </dl>
    </div>
  );
}
