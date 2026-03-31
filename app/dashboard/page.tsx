import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleTable } from "@/components/simple-table";
import {
  branchPerformance,
  dashboardStats,
  lowStock,
  notifications,
  orders,
  salesTrend,
  topSellingProducts,
} from "@/lib/mock-data";

const statColorMap: Record<string, string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-600",
};

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("ready")) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (normalized.includes("waiting") || normalized.includes("pending")) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  if (normalized.includes("cancel") || normalized.includes("overdue")) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

export default function DashboardPage() {
  const maxSales = Math.max(...salesTrend.map((item) => item.sales));

  return (
    <PageShell
      title="Dashboard"
      subtitle="Monitor sales, branch performance, inventory risks, customer orders, and daily operations."
      actions={
        <>
          <Button>New Sale</Button>
          <Button variant="outline">Create Customer Order</Button>
          <Button variant="outline">Create Job Order</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Card
            key={stat.label}
            className={stat.featured ? "border-primary/30 shadow-sm" : ""}
          >
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {stat.value}
              </h3>
              <p
                className={`mt-2 text-sm ${statColorMap[stat.tone] ?? "text-primary"}`}
              >
                {stat.hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Sales Trend (Last 7 Days)</CardTitle>
            <Badge variant="secondary">Daily Overview</Badge>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-end gap-3">
              {salesTrend.map((day) => {
                const height = `${Math.max((day.sales / maxSales) * 100, 12)}%`;

                return (
                  <div
                    key={day.day}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <div className="text-xs font-medium text-slate-500">
                      ₱{day.sales.toLocaleString()}
                    </div>
                    <div className="flex h-48 w-full items-end">
                      <div
                        className="w-full rounded-t-xl bg-primary/85 transition-all"
                        style={{ height }}
                      />
                    </div>
                    <div className="text-xs text-slate-500">{day.day}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Branch Performance</CardTitle>
            <Badge variant="secondary">This Month</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {branchPerformance.map((branch) => (
              <div key={branch.branch} className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{branch.branch}</p>
                  <span className="text-sm font-semibold text-foreground">
                    {branch.sales}
                  </span>
                </div>

                <div className="mb-3 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${branch.progress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{branch.transactions} transactions</span>
                  <span>{branch.share}% of total sales</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SimpleTable
          title="Low Stock Alerts"
          headers={["Item", "Branch", "Qty", "Reorder Level"]}
          rows={lowStock.map((item) => [
            item.item,
            item.branch,
            <span
              key={`${item.item}-${item.branch}-qty`}
              className="font-medium text-red-600"
            >
              {item.qty}
            </span>,
            item.reorderLevel,
          ])}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Latest Notifications</CardTitle>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {notifications.map((item) => (
              <div key={item.title} className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <Badge variant="secondary">{item.time}</Badge>
                </div>
                <p className="text-sm text-slate-500">{item.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SimpleTable
          title="Pending Customer Orders"
          headers={[
            "Order No.",
            "Customer",
            "Item",
            "Status",
            "Downpayment",
            "Release Date",
          ]}
          rows={orders.map((order) => [
            order.orderNo,
            order.customer,
            order.item,
            <Badge
              key={`${order.orderNo}-status`}
              className={getStatusBadgeClass(order.status)}
            >
              {order.status}
            </Badge>,
            order.downpayment,
            order.releaseDate,
          ])}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Top Selling Products</CardTitle>
            <Badge variant="secondary">This Month</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {topSellingProducts.map((product, index) => (
              <div
                key={product.name}
                className="flex items-center justify-between rounded-2xl border p-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {index + 1}. {product.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {product.unitsSold} units sold
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {product.revenue}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
