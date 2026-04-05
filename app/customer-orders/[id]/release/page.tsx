"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, PackageCheck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

export default function ReleaseCustomerOrderPage() {
  const order = {
    orderNo: "CO-2026-0001",
    customer: "Juan Dela Cruz",
    releaseDate: "2026-04-10",
    paymentStatus: "Partial",
    subtotal: 14500,
    downpayment: 3000,
    balance: 11500,
    items: [
      { name: "3M Tint Medium Black", quantity: 1, amount: 8500 },
      { name: "Seat Cover Set", quantity: 1, amount: 6000 },
    ],
  };

  return (
    <PageShell
      title="Release Customer Order"
      subtitle="Confirm release details before completing this customer order."
      actions={
        <div className="flex gap-2">
          <Link href="/customer-orders">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Order
            </Button>
          </Link>

          <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
            Confirm Release
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-foreground">
                  Order to Release
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Order No.</p>
                  <p className="mt-1 font-medium text-foreground">
                    {order.orderNo}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Customer</p>
                  <p className="mt-1 font-medium text-foreground">
                    {order.customer}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Planned Release Date</p>
                  <p className="mt-1 font-medium text-foreground">
                    {order.releaseDate}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-500">Payment Status</p>
                  <div className="mt-1">
                    <Badge className="border border-amber-200 bg-amber-50 text-amber-700">
                      {order.paymentStatus}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-foreground">
                Items for Release
              </h3>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead className="bg-slate-50">
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.name} className="border-b">
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">
                          {formatPeso(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-foreground">
                  Release Summary
                </h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-foreground">
                    {formatPeso(order.subtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Downpayment</span>
                  <span className="font-medium text-foreground">
                    {formatPeso(order.downpayment)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Remaining Balance</span>
                  <span>{formatPeso(order.balance)}</span>
                </div>

                <div className="space-y-2">
                  <Label>Release Reference / Remarks</Label>
                  <Input placeholder="Receipt no., released by, remarks, etc." />
                </div>

                <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  In backend integration, this page should:
                  <br />
                  1. validate payment or remaining balance rule
                  <br />
                  2. deduct reserved stock
                  <br />
                  3. mark order as Released
                  <br />
                  4. create release audit trail
                </div>

                <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                  Confirm Release
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
