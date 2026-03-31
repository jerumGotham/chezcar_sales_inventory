"use client";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleTable } from "@/components/simple-table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";

const statColorMap: Record<string, string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-600",
};

function getStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("ready") ||
    normalized.includes("completed") ||
    normalized.includes("approved")
  ) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
  }

  if (
    normalized.includes("waiting") ||
    normalized.includes("pending") ||
    normalized.includes("for approval") ||
    normalized.includes("in progress")
  ) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100";
  }

  if (
    normalized.includes("cancel") ||
    normalized.includes("overdue") ||
    normalized.includes("critical")
  ) {
    return "bg-red-100 text-red-700 hover:bg-red-100";
  }

  return "bg-slate-100 text-slate-700 hover:bg-slate-100";
}

function formatPeso(value: number) {
  return `₱${value.toLocaleString()}`;
}

export const dashboardStats = [
  {
    label: "Today's Sales",
    value: "₱58,420",
    hint: "+12.4% vs yesterday",
    tone: "success",
    featured: true,
  },
  {
    label: "This Month Sales",
    value: "₱1,284,300",
    hint: "+8.1% vs last month",
    tone: "info",
  },
  {
    label: "Pending Orders",
    value: "14",
    hint: "5 with downpayment",
    tone: "warning",
  },
  {
    label: "Low Stock Items",
    value: "9",
    hint: "Needs replenishment",
    tone: "danger",
  },
];

const salesTrend = [
  { day: "Mon", sales: 32000 },
  { day: "Tue", sales: 38500 },
  { day: "Wed", sales: 36400 },
  { day: "Thu", sales: 41750 },
  { day: "Fri", sales: 44200 },
  { day: "Sat", sales: 48900 },
  { day: "Sun", sales: 41860 },
];

const branchPerformance = [
  { branch: "QC Main", sales: 185000 },
  { branch: "Makati", sales: 158000 },
  { branch: "Pasig", sales: 124500 },
];

const lowStock = [
  { item: "3M Tint Medium Black", branch: "QC Main", qty: 2, reorderLevel: 5 },
  { item: "Dash Cam 1080p", branch: "Makati", qty: 1, reorderLevel: 3 },
  { item: "Car Mat Universal", branch: "Pasig", qty: 3, reorderLevel: 8 },
  { item: "Android Head Unit", branch: "QC Main", qty: 1, reorderLevel: 2 },
];

const notifications = [
  {
    title: "Low stock alert",
    description: "3M Tint Medium Black is below reorder level in QC Main.",
    time: "12 mins ago",
  },
  {
    title: "Order ready for release",
    description: "ORD-4102 can now be released to customer.",
    time: "28 mins ago",
  },
  {
    title: "Transfer awaiting approval",
    description: "TR-104 requires owner confirmation.",
    time: "1 hour ago",
  },
];

const inventoryActivity = [
  {
    referenceNo: "INV-2001",
    type: "Stock In",
    branch: "QC Main",
    item: "3M Tint Medium Black",
    qty: "+20",
    status: "Approved",
  },
  {
    referenceNo: "TR-104",
    type: "Transfer Out",
    branch: "Makati",
    item: "Dash Cam 1080p",
    qty: "-5",
    status: "Pending Approval",
  },
  {
    referenceNo: "ADJ-3009",
    type: "Adjustment",
    branch: "Pasig",
    item: "Car Mat Universal",
    qty: "-2",
    status: "Completed",
  },
];

const fastMovingCategories = [
  { name: "Tint Packages", units: 42, revenue: 126000 },
  { name: "Seat Covers", units: 28, revenue: 112000 },
  { name: "Audio Upgrades", units: 16, revenue: 193500 },
  { name: "Exterior Accessories", units: 12, revenue: 72000 },
];

const orders = [
  {
    orderNo: "ORD-4101",
    customer: "Paolo Santos",
    item: "Toyota Rush Seat Cover",
    status: "Waiting Stock",
    downpayment: "₱2,500",
    releaseDate: "2026-04-06",
  },
  {
    orderNo: "ORD-4102",
    customer: "Lea Ramos",
    item: "Roof Rack",
    status: "Ready for Release",
    downpayment: "₱4,000",
    releaseDate: "2026-04-02",
  },
  {
    orderNo: "ORD-4103",
    customer: "Marco Lim",
    item: "Reverse Camera",
    status: "Pending Installation",
    downpayment: "₱1,500",
    releaseDate: "2026-04-04",
  },
];

const topSellingProducts = [
  { name: "3M Tint Medium Black", unitsSold: 37, revenue: 111000 },
  { name: "Toyota Rush Seat Cover", unitsSold: 23, revenue: 94300 },
  { name: "Android Head Unit", unitsSold: 14, revenue: 189000 },
  { name: "Roof Rack", unitsSold: 11, revenue: 80300 },
];

export default function AdminDashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      subtitle="Monitor daily sales, inventory health, customer orders, branch activity, and replenishment priorities."
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
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={salesTrend}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => `₱${Math.round(value / 1000)}k`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={55}
                />
                <Tooltip
                  formatter={(value) => [
                    formatPeso(Number(value ?? 0)),
                    "Sales",
                  ]}
                  labelClassName="text-slate-700"
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#196130"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Branch Performance</CardTitle>
            <Badge variant="secondary">This Month</Badge>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={branchPerformance}
                layout="vertical"
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `₱${Math.round(value / 1000)}k`}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="branch"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  width={96}
                />
                <Tooltip
                  formatter={(value) => [
                    formatPeso(Number(value ?? 0)),
                    "Sales",
                  ]}
                  labelClassName="text-slate-700"
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Bar dataKey="sales" fill="#196130" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
          title="Recent Inventory Activity"
          headers={["Reference No.", "Type", "Branch", "Item", "Qty", "Status"]}
          rows={inventoryActivity.map((item) => [
            item.referenceNo,
            item.type,
            item.branch,
            item.item,
            item.qty,
            <Badge
              key={`${item.referenceNo}-status`}
              className={getStatusBadgeClass(item.status)}
            >
              {item.status}
            </Badge>,
          ])}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Fast Moving Categories</CardTitle>
            <Badge variant="secondary">This Week</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {fastMovingCategories.map((category, index) => (
              <div
                key={category.name}
                className="flex items-center justify-between rounded-2xl border p-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {index + 1}. {category.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {category.units} transactions
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {formatPeso(category.revenue)}
                </p>
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
                  {formatPeso(product.revenue)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
