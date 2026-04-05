"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Customer = {
  id: string;
  name: string;
  mobile?: string;
  email?: string;
  branch?: string;
  city?: string;
  vehicle?: string;
  totalSpend?: string;
  pendingOrders?: number;
  activeJobOrders?: number;
};

interface CustomerHistoryTabsProps {
  customer: Customer;
}

export default function CustomerHistoryTabs({
  customer,
}: CustomerHistoryTabsProps) {
  return (
    <Tabs defaultValue="sales" className="flex h-full min-h-0 flex-col">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <TabsList className="grid h-auto w-full grid-cols-4 gap-2 rounded-xl bg-slate-100 p-1">
          <TabsTrigger
            value="sales"
            className="
              rounded-lg
              text-slate-600
              transition-all
              hover:bg-white
              hover:text-slate-900
              data-[state=active]:bg-emerald-600
              data-[state=active]:text-white
              data-[state=active]:shadow-sm
              data-[state=active]:font-semibold
            "
          >
            Sales
          </TabsTrigger>

          <TabsTrigger
            value="orders"
            className="
              rounded-lg
              text-slate-600
              transition-all
              hover:bg-white
              hover:text-slate-900
              data-[state=active]:bg-emerald-600
              data-[state=active]:text-white
              data-[state=active]:shadow-sm
              data-[state=active]:font-semibold
            "
          >
            Orders
          </TabsTrigger>

          <TabsTrigger
            value="jobOrders"
            className="
              rounded-lg
              text-slate-600
              transition-all
              hover:bg-white
              hover:text-slate-900
              data-[state=active]:bg-emerald-600
              data-[state=active]:text-white
              data-[state=active]:shadow-sm
              data-[state=active]:font-semibold
            "
          >
            Job Orders
          </TabsTrigger>

          <TabsTrigger
            value="notes"
            className="
              rounded-lg
              text-slate-600
              transition-all
              hover:bg-white
              hover:text-slate-900
              data-[state=active]:bg-emerald-600
              data-[state=active]:text-white
              data-[state=active]:shadow-sm
              data-[state=active]:font-semibold
            "
          >
            Notes
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="mt-4 flex-1 min-h-0">
        <TabsContent value="sales" className="mt-0 h-full">
          <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">
                      3M Tint Medium Black
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Purchased at {customer.branch || "—"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-700">
                    ₱8,500
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">
                      Seat Cover Set
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Purchased at {customer.branch || "—"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-700">
                    ₱6,000
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-0 h-full">
          <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      ORD-3012 • Roof Rack
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Downpayment: ₱3,000
                    </p>
                  </div>
                  <Badge className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
                    Waiting Stock
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  Release target: Apr 5
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobOrders" className="mt-0 h-full">
          <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      JO-8804 • Head Unit Installation
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Assigned to Tech A
                    </p>
                  </div>
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    In Progress
                  </Badge>
                </div>

                <p className="mt-3 text-sm text-slate-500">
                  Scheduled today at 3:00 PM
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-0 h-full">
          <Card className="h-full rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-slate-900">
                Customer Notes
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Prefers dark tint shade, usually schedules installation on
                weekends, and asks for product recommendations based on vehicle
                fit.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </div>
    </Tabs>
  );
}
