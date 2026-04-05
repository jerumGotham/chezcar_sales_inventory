"use client";

import { useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimpleTable } from "@/components/simple-table";
import {
  branchPerformance,
  lowStock,
  orders,
  salesTrend,
  topSellingProducts,
} from "@/lib/mock-data";
import {
  statColorMap,
  formatPeso,
  safeNumber,
  getStatusBadgeClass,
  getBranches,
  getFilteredData,
  getPendingOrders,
  groupTopProducts,
  getXAxisKey,
} from "@/lib/dashboard-data";
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

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{
    value?: number;
    name?: string;
    payload?: {
      branch?: string;
      day?: string;
      label?: string;
    };
  }>;
  label?: string;
};

function BranchPerformanceTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0];
  const branch = item?.payload?.branch ?? item?.name ?? "Branch";
  const value = Number(item?.value ?? 0);

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-foreground">{branch}</p>
      <p className="text-sm text-muted-foreground">
        Sales:{" "}
        <span className="font-semibold text-foreground">
          {formatPeso(value)}
        </span>
      </p>
    </div>
  );
}

function SalesTrendTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const value = Number(payload[0]?.value ?? 0);
  const displayLabel =
    payload[0]?.payload?.day ?? payload[0]?.payload?.label ?? label ?? "Sales";

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-foreground">{displayLabel}</p>
      <p className="text-sm text-muted-foreground">
        Sales:{" "}
        <span className="font-semibold text-foreground">
          {formatPeso(value)}
        </span>
      </p>
    </div>
  );
}

function formatMonth(month: string) {
  const monthNum = Number(month);
  if (isNaN(monthNum) || monthNum < 0 || monthNum > 11) return month;
  return new Date(0, monthNum).toLocaleString("default", { month: "long" });
}

export default function AdminDashboardPage() {
  const now = new Date();
  const currentMonth = String(now.getMonth());
  const currentYear = String(now.getFullYear());

  const [selectedBranch, setSelectedBranch] = useState("all");

  const filters = {
    selectedBranch,
    selectedMonth: currentMonth,
    selectedYear: currentYear,
  };

  const branches = useMemo(() => getBranches(branchPerformance), []);

  const filteredBranchPerformance = useMemo(
    () => getFilteredData(branchPerformance, filters),
    [selectedBranch, currentMonth, currentYear],
  );

  const filteredLowStock = useMemo(
    () => getFilteredData(lowStock, filters),
    [selectedBranch, currentMonth, currentYear],
  );

  const filteredOrders = useMemo(() => {
    return getPendingOrders(getFilteredData(orders, filters));
  }, [selectedBranch, currentMonth, currentYear]);

  const filteredSalesTrend = useMemo(
    () => getFilteredData(salesTrend, filters),
    [selectedBranch, currentMonth, currentYear],
  );

  const groupedTopProducts = useMemo(() => {
    return groupTopProducts(getFilteredData(topSellingProducts, filters));
  }, [selectedBranch, currentMonth, currentYear]);

  const displayedTopProducts = useMemo(
    () => groupedTopProducts.slice(0, 5),
    [groupedTopProducts],
  );

  const topProduct = useMemo(
    () => groupedTopProducts[0] ?? null,
    [groupedTopProducts],
  );

  const totalSales = useMemo(() => {
    if (filteredSalesTrend.length > 0) {
      return filteredSalesTrend.reduce(
        (total, item) => total + safeNumber(item.sales),
        0,
      );
    }

    return filteredBranchPerformance.reduce(
      (total, item) => total + safeNumber(item.sales),
      0,
    );
  }, [filteredSalesTrend, filteredBranchPerformance]);

  const latestSales = useMemo(() => {
    if (filteredSalesTrend.length === 0) return 0;
    return safeNumber(filteredSalesTrend[filteredSalesTrend.length - 1]?.sales);
  }, [filteredSalesTrend]);

  const totalUnitsSold = useMemo(() => {
    return groupedTopProducts.reduce(
      (total, item) => total + item.unitsSold,
      0,
    );
  }, [groupedTopProducts]);

  const summaryCards = [
    {
      label: "Total Sales",
      value: formatPeso(totalSales),
      hint: "Current month sales based on selected branch",
      tone: "info",
    },
    {
      label: "Latest Sales",
      value: formatPeso(latestSales),
      hint: "Latest visible sales record",
      tone: "success",
    },
    {
      label: "Top Product",
      value: topProduct?.name ?? "No Data",
      hint: topProduct
        ? `${topProduct.unitsSold.toLocaleString()} units sold`
        : "No sales data for current month",
      tone: "info",
    },
    {
      label: "Total Units Sold",
      value: totalUnitsSold.toLocaleString(),
      hint: "Units sold this month",
      tone: "success",
    },
    {
      label: "Pending Orders",
      value: String(filteredOrders.length),
      hint: "Orders needing processing or release",
      tone: filteredOrders.length > 0 ? "warning" : "info",
    },
    {
      label: "Low Stock Items",
      value: String(filteredLowStock.length),
      hint: "Items below reorder level",
      tone: filteredLowStock.length > 0 ? "danger" : "success",
    },
  ];

  const xAxisKey = getXAxisKey(filteredSalesTrend);

  return (
    <PageShell
      title="Admin Dashboard"
      subtitle="Operational overview for the current month, focused on branch activity, stock risks, orders, and sales movement."
    >
      <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Branch Filter
          </h2>
          <p className="text-sm text-muted-foreground">
            Admin dashboard automatically shows data for the current month and
            current year.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-1">
          <div className="max-w-sm">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch === "all" ? "All Branches" : branch}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">
            {selectedBranch === "all" ? "All Branches" : selectedBranch}
          </Badge>
          <Badge variant="secondary">{formatMonth(currentMonth)}</Badge>
          <Badge variant="secondary">{currentYear}</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map((stat) => (
          <Card key={stat.label} className="border-border bg-card shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <h3 className="mt-3 text-3xl font-bold text-foreground">
                {stat.value}
              </h3>
              <p
                className={`mt-2 text-sm ${
                  statColorMap[stat.tone] ?? "text-primary"
                }`}
              >
                {stat.hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Sales Trend</CardTitle>
            <Badge variant="secondary">Current Month</Badge>
          </CardHeader>
          <CardContent className="h-[320px] overflow-visible">
            <div className="h-full overflow-visible">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={filteredSalesTrend}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    className="text-border"
                  />
                  <XAxis
                    dataKey={xAxisKey}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(value) => `₱${Math.round(value / 1000)}k`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    width={55}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    content={<SalesTrendTooltip />}
                    wrapperStyle={{ zIndex: 1000, pointerEvents: "none" }}
                    cursor={{
                      stroke: "rgba(100, 116, 139, 0.2)",
                      strokeWidth: 1,
                    }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#196130" }}
                    activeDot={{ r: 6 }}
                    stroke="#196130"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Branch Performance</CardTitle>
            <Badge variant="secondary">
              {selectedBranch === "all" ? "All Branches" : selectedBranch}
            </Badge>
          </CardHeader>
          <CardContent className="h-[320px] overflow-visible">
            <div className="h-full overflow-visible">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filteredBranchPerformance}
                  layout="vertical"
                  margin={{ top: 10, right: 40, left: 10, bottom: 0 }}
                  barCategoryGap={18}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="currentColor"
                    className="text-border"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => `₱${Math.round(value / 1000)}k`}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="branch"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "currentColor" }}
                    width={90}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(100, 116, 139, 0.08)" }}
                    content={<BranchPerformanceTooltip />}
                    wrapperStyle={{ zIndex: 1000, pointerEvents: "none" }}
                    isAnimationActive={false}
                  />
                  <Bar dataKey="sales" fill="#196130" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Top Selling Products</CardTitle>
            <Badge variant="secondary">Top 5</Badge>
          </CardHeader>
          <CardContent>
            {displayedTopProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 pr-4 text-sm font-medium text-muted-foreground">
                        Rank
                      </th>
                      <th className="py-3 pr-4 text-sm font-medium text-muted-foreground">
                        Product
                      </th>
                      <th className="py-3 pr-4 text-sm font-medium text-muted-foreground">
                        Units Sold
                      </th>
                      <th className="py-3 text-right text-sm font-medium text-muted-foreground">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTopProducts.map((product, index) => (
                      <tr
                        key={`${product.name}-${index}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-4 pr-4 align-top">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {index + 1}
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="font-medium text-foreground">
                            {product.name}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <p className="font-semibold text-foreground">
                            {product.unitsSold.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            units sold
                          </p>
                        </td>
                        <td className="py-4 text-right">
                          <p className="font-semibold text-foreground">
                            {formatPeso(product.revenue)}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No top-selling data available for the current month.
              </div>
            )}
          </CardContent>
        </Card>

        <SimpleTable
          title="Low Stock Alerts"
          headers={["Item", "Branch", "Qty", "Reorder Level"]}
          rows={filteredLowStock.map((item) => [
            item.item,
            item.branch,
            <span
              key={`${item.item}-${item.branch}-qty`}
              className="font-medium text-red-600 dark:text-red-400"
            >
              {item.qty}
            </span>,
            item.reorderLevel,
          ])}
        />
      </div>

      <div className="mt-6">
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
          rows={filteredOrders.map((order) => [
            order.orderNo,
            order.customer,
            order.item,
            <Badge
              key={`${order.orderNo}-status`}
              className={getStatusBadgeClass(String(order.status ?? ""))}
            >
              {String(order.status ?? "")}
            </Badge>,
            order.downpayment,
            order.releaseDate,
          ])}
        />
      </div>
    </PageShell>
  );
}
