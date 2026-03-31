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

type Tone = "success" | "warning" | "danger" | "info";

type DashboardStat = {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
  featured?: boolean;
};

type SalesTrendItem = {
  day: string;
  sales: number;
};

type BranchPerformanceItem = {
  branch: string;
  sales: number;
};

type LowStockItem = {
  item: string;
  branch: string;
  qty: number;
  reorderLevel: number;
};

type NotificationItem = {
  title: string;
  description: string;
  time: string;
};

type OrderItem = {
  orderNo: string;
  customer: string;
  item: string;
  status: string;
  downpayment: string;
  releaseDate: string;
};

type ProductItem = {
  name: string;
  unitsSold: number;
  revenue: number;
};

type DashboardContent = {
  stats: DashboardStat[];
  salesTrend: SalesTrendItem[];
  branchPerformance: BranchPerformanceItem[];
  lowStock: LowStockItem[];
  notifications: NotificationItem[];
  orders: OrderItem[];
  topSellingProducts: ProductItem[];
  secondTableTitle: string;
  secondTableHeaders: string[];
  secondTableRows: Array<Array<string | number>>;
  secondCardTitle: string;
  secondCardBadge: string;
  secondCardItems: ProductItem[];
};

const statColorMap: Record<Tone, string> = {
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

function SalesTrendSection({
  title,
  badge,
  salesTrend,
}: {
  title: string;
  badge: string;
  salesTrend: SalesTrendItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary">{badge}</Badge>
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
              formatter={(value) => [formatPeso(Number(value ?? 0)), "Sales"]}
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
  );
}

function BranchPerformanceSection({ data }: { data: BranchPerformanceItem[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Branch Performance</CardTitle>
        <Badge variant="secondary">This Month</Badge>
      </CardHeader>
      <CardContent className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
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
              formatter={(value) => [formatPeso(Number(value ?? 0)), "Sales"]}
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
  );
}

function NotificationCard({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  return (
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
  );
}

function RankedCardList({
  title,
  badge,
  items,
}: {
  title: string;
  badge: string;
  items: ProductItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary">{badge}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex items-center justify-between rounded-2xl border p-4"
          >
            <div>
              <p className="font-medium text-foreground">
                {index + 1}. {item.name}
              </p>
              <p className="text-sm text-slate-500">{item.unitsSold} units</p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {formatPeso(item.revenue)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DashboardTemplate({
  subtitle,
  stats,
  salesTrend,
  branchPerformance,
  lowStock,
  notifications,
  orders,
  topSellingProducts,
  secondTableTitle,
  secondTableHeaders,
  secondTableRows,
  secondCardTitle,
  secondCardBadge,
  secondCardItems,
}: {
  subtitle: string;
} & DashboardContent) {
  return (
    <PageShell title="Dashboard" subtitle={subtitle}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={stat.featured ? "border-primary/30 shadow-sm" : ""}
          >
            <CardContent className="p-5">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {stat.value}
              </h3>
              <p className={`mt-2 text-sm ${statColorMap[stat.tone]}`}>
                {stat.hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SalesTrendSection
          title="Sales Trend (Last 7 Days)"
          badge="Daily Overview"
          salesTrend={salesTrend}
        />
        <BranchPerformanceSection data={branchPerformance} />
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

        <NotificationCard notifications={notifications} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SimpleTable
          title={secondTableTitle}
          headers={secondTableHeaders}
          rows={secondTableRows.map((row, rowIndex) =>
            row.map((cell, cellIndex) => {
              const value = String(cell);
              const header = secondTableHeaders[cellIndex]?.toLowerCase() ?? "";

              if (header === "status") {
                return (
                  <Badge
                    key={`${rowIndex}-${cellIndex}`}
                    className={getStatusBadgeClass(value)}
                  >
                    {value}
                  </Badge>
                );
              }

              return cell;
            }),
          )}
        />

        <RankedCardList
          title={secondCardTitle}
          badge={secondCardBadge}
          items={secondCardItems}
        />
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

        <RankedCardList
          title="Top Selling Products"
          badge="This Month"
          items={topSellingProducts}
        />
      </div>
    </PageShell>
  );
}

const branchManagerDashboardContent: DashboardContent = {
  stats: [
    {
      label: "Today’s Branch Sales",
      value: "₱22,540",
      hint: "+6.1% vs yesterday",
      tone: "success",
      featured: true,
    },
    {
      label: "Open Job Orders",
      value: "8",
      hint: "3 scheduled today",
      tone: "info",
    },
    {
      label: "Pending Transfers",
      value: "3",
      hint: "1 for release, 2 inbound",
      tone: "warning",
    },
    {
      label: "Critical Low Stock",
      value: "5",
      hint: "Immediate restock needed",
      tone: "danger",
    },
  ],
  salesTrend: [
    { day: "Mon", sales: 18000 },
    { day: "Tue", sales: 21400 },
    { day: "Wed", sales: 20750 },
    { day: "Thu", sales: 22600 },
    { day: "Fri", sales: 24100 },
    { day: "Sat", sales: 26850 },
    { day: "Sun", sales: 22540 },
  ],
  branchPerformance: [
    { branch: "Counter Sales", sales: 97000 },
    { branch: "Installations", sales: 78500 },
    { branch: "Special Orders", sales: 52100 },
  ],
  lowStock: [
    {
      item: "3M Tint Medium Black",
      branch: "QC Main",
      qty: 2,
      reorderLevel: 5,
    },
    { item: "Roof Rack", branch: "QC Main", qty: 1, reorderLevel: 3 },
    { item: "LED Headlight Bulb", branch: "QC Main", qty: 2, reorderLevel: 6 },
    { item: "Backing Sensor", branch: "QC Main", qty: 1, reorderLevel: 4 },
  ],
  notifications: [
    {
      title: "Technician update",
      description:
        "JO-9008 installation moved to 3:00 PM due to late vehicle arrival.",
      time: "8 mins ago",
    },
    {
      title: "Stock transfer inbound",
      description: "TR-108 from Makati is arriving this afternoon.",
      time: "22 mins ago",
    },
    {
      title: "Low stock alert",
      description: "Roof Rack has reached critical level in QC Main.",
      time: "47 mins ago",
    },
  ],
  orders: [
    {
      orderNo: "ORD-5201",
      customer: "Aubrey Co",
      item: "Seat Cover Set",
      status: "Waiting Stock",
      downpayment: "₱2,000",
      releaseDate: "2026-04-05",
    },
    {
      orderNo: "ORD-5202",
      customer: "Ryan Dela Cruz",
      item: "Roof Rack",
      status: "Ready for Release",
      downpayment: "₱3,500",
      releaseDate: "2026-04-01",
    },
  ],
  topSellingProducts: [
    { name: "3M Tint Medium Black", unitsSold: 19, revenue: 57000 },
    { name: "Roof Rack", unitsSold: 9, revenue: 65700 },
    { name: "Seat Cover Set", unitsSold: 12, revenue: 48600 },
    { name: "Reverse Camera", unitsSold: 7, revenue: 29400 },
  ],
  secondTableTitle: "Active Job Orders",
  secondTableHeaders: [
    "JO No.",
    "Customer",
    "Service",
    "Status",
    "Schedule",
    "Assigned To",
  ],
  secondTableRows: [
    [
      "JO-9008",
      "Mark Reyes",
      "Tint Installation",
      "In Progress",
      "Apr 1, 3:00 PM",
      "Tech A",
    ],
    [
      "JO-9009",
      "Gina Lopez",
      "Head Unit Install",
      "Pending",
      "Apr 1, 4:30 PM",
      "Tech B",
    ],
    [
      "JO-9010",
      "Carlo Tan",
      "Back Sensor Setup",
      "Ready",
      "Apr 2, 10:00 AM",
      "Tech C",
    ],
  ],
  secondCardTitle: "Staff Productivity",
  secondCardBadge: "Today",
  secondCardItems: [
    { name: "Tech A", unitsSold: 4, revenue: 12400 },
    { name: "Tech B", unitsSold: 3, revenue: 9800 },
    { name: "Tech C", unitsSold: 2, revenue: 7600 },
    { name: "Counter Team", unitsSold: 11, revenue: 45200 },
  ],
};

export default function BranchManagerDashboardPage() {
  return (
    <DashboardTemplate
      subtitle="Track branch sales, active job orders, inbound and outbound stock, customer pickups, and urgent inventory actions."
      {...branchManagerDashboardContent}
    />
  );
}
