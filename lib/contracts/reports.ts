export const REPORT_TYPES = [
  "sales",
  "inventory-summary",
  "inventory-movements",
  "returns-warranty",
  "low-stock",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportOption = { id: string; label: string };

export type ReportMeta = {
  type: ReportType;
  generatedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  filters: {
    branches: ReportOption[];
    salespersons: ReportOption[];
    actors: ReportOption[];
  };
};

export type SalesReport = ReportMeta & {
  type: "sales";
  rows: Array<{
    id: string;
    verifiedAt: string;
    receipt: string;
    branch: string;
    salesperson: string;
    source: "Direct Sale" | "Customer Order";
    paymentMethod: string;
    customer: string;
    totalAmount: number;
    units: number;
    discountAmount: number;
  }>;
  branchTotals: Array<{ branch: string; transactionCount: number; units: number; totalAmount: number; percentage: number }>;
  grandTotal: { transactionCount: number; units: number; totalDiscount: number; averageSale: number; totalAmount: number };
};

export type InventoryReportRow = {
  id: string;
  itemCode: string;
  product: string;
  branch: string;
  onHand: number;
  reserved: number;
  quarantined: number;
  available: number;
  reorderLevel: number;
  suggestedReorder: number;
};

export type InventorySummaryReport = ReportMeta & {
  type: "inventory-summary";
  rows: InventoryReportRow[];
  totals: Omit<InventoryReportRow, "id" | "itemCode" | "product" | "branch" | "reorderLevel" | "suggestedReorder">;
};

export type LowStockReport = ReportMeta & {
  type: "low-stock";
  rows: InventoryReportRow[];
};

export type InventoryMovementsReport = ReportMeta & {
  type: "inventory-movements";
  rows: Array<{
    id: string;
    occurredAt: string;
    createdAt: string;
    branch: string;
    itemCode: string;
    product: string;
    type: string;
    quantity: number;
    actor: string;
    reference: string;
  }>;
};

export type ReturnsWarrantyReport = ReportMeta & {
  type: "returns-warranty";
  rows: Array<{
    id: string;
    recordType: "Backjob" | "Customer Warranty" | "Supplier Claim";
    createdAt: string;
    reference: string;
    branch: string;
    party: string;
    item: string;
    quantity: number;
    status: string;
  }>;
};

export type ReportResult =
  | SalesReport
  | InventorySummaryReport
  | InventoryMovementsReport
  | ReturnsWarrantyReport
  | LowStockReport;
