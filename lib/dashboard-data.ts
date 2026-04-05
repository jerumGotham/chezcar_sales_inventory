export const MONTH_OPTIONS = [
  { value: "all", label: "All Months" },
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

export const CURRENT_YEAR = new Date().getFullYear();

export const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => {
  const year = CURRENT_YEAR - index;
  return { value: String(year), label: String(year) };
});

export const statColorMap: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  info: "text-sky-600 dark:text-sky-400",
};

export function formatPeso(value: number) {
  return `₱${value.toLocaleString()}`;
}

export function safeNumber(value: unknown) {
  return Number(value ?? 0);
}

export function getStatusBadgeClass(status: string) {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized.includes("ready") || normalized.includes("completed")) {
    return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/15";
  }

  if (
    normalized.includes("waiting") ||
    normalized.includes("pending") ||
    normalized.includes("processing")
  ) {
    return "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/15";
  }

  if (normalized.includes("cancel") || normalized.includes("overdue")) {
    return "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/15";
  }

  return "bg-muted text-muted-foreground hover:bg-muted";
}

type DashboardFilters = {
  selectedBranch: string;
  selectedMonth: string;
  selectedYear: string;
};

export function getBranches<T extends { branch?: string }>(data: T[]) {
  const uniqueBranches = Array.from(
    new Set(data.map((item) => item.branch).filter(Boolean) as string[]),
  );

  return ["all", ...uniqueBranches];
}

export function matchesFilters(
  item: Record<string, unknown>,
  filters: DashboardFilters,
) {
  const { selectedBranch, selectedMonth, selectedYear } = filters;

  if (selectedBranch !== "all" && "branch" in item) {
    if (String(item.branch ?? "") !== selectedBranch) return false;
  }

  if (selectedYear !== "all" && "year" in item) {
    if (String(item.year ?? "") !== selectedYear) return false;
  }

  if (selectedMonth !== "all" && "month" in item) {
    if (String(item.month ?? "") !== selectedMonth) return false;
  }

  return true;
}

export function getFilteredData<T extends Record<string, unknown>>(
  data: T[],
  filters: DashboardFilters,
) {
  return data.filter((item) => matchesFilters(item, filters));
}

export function getPendingOrders<T extends Record<string, unknown>>(
  orders: T[],
) {
  return orders.filter((order) => {
    const normalized = String(order.status ?? "").toLowerCase();
    return (
      normalized.includes("pending") ||
      normalized.includes("waiting") ||
      normalized.includes("processing")
    );
  });
}

export function groupTopProducts<T extends Record<string, unknown>>(
  products: T[],
) {
  const groupedMap = new Map<
    string,
    {
      name: string;
      unitsSold: number;
      revenue: number;
    }
  >();

  for (const item of products) {
    const productName = String(item.name ?? "").trim();
    if (!productName) continue;

    const existing = groupedMap.get(productName);

    if (existing) {
      existing.unitsSold += safeNumber(item.unitsSold);
      existing.revenue += safeNumber(item.revenue);
    } else {
      groupedMap.set(productName, {
        name: productName,
        unitsSold: safeNumber(item.unitsSold),
        revenue: safeNumber(item.revenue),
      });
    }
  }

  return Array.from(groupedMap.values()).sort((a, b) => {
    const unitsDiff = b.unitsSold - a.unitsSold;
    if (unitsDiff !== 0) return unitsDiff;
    return b.revenue - a.revenue;
  });
}

export function getXAxisKey(data: Record<string, unknown>[]) {
  if (data.length === 0) return "day";
  return "day" in data[0] ? "day" : "label";
}
