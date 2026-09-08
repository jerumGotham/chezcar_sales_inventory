export const REPORT_TYPES = [
  "sales",
  "salesperson-sales",
  "inventory-summary",
  "returns-warranty",
] as const;

export const SALE_SOURCES = ["DIRECT_SALE", "CUSTOMER_ORDER"] as const;
export const PAYMENT_METHODS = ["CASH", "GCASH", "MAYA", "BANK_TRANSFER", "CREDIT_CARD", "SPLIT"] as const;
export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const RETURN_CASE_TYPES = ["BACKJOB", "CUSTOMER_WARRANTY", "SUPPLIER_CLAIM"] as const;
export const RETURN_STATUSES = [
  "DRAFT", "SCHEDULED", "IN_PROGRESS", "ASSESSMENT", "APPROVED_REPAIR", "APPROVED_REPLACEMENT",
  "WAITING_STOCK", "READY", "RELEASED", "PENDING", "WAITING_REPLACEMENT", "PARTIAL",
  "REPLACEMENT_RECEIVED", "COMPLETED", "CANCELLED", "REJECTED",
] as const;
export const RETURN_RESOLUTIONS = ["COVERED", "CHARGEABLE", "REPAIR", "REPLACEMENT", "REFUND", "CREDIT"] as const;

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportOption = { id: string; label: string };
export type ReportBreakdown = { label: string; count: number };

export function reportMonthEnd(date: string) {
  const end = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

export type ReportFilterOptions = {
  locations: ReportOption[];
  defaultLocationId: string | null;
  salespersons: ReportOption[];
  categories: ReportOption[];
  brands: ReportOption[];
};

export type ReportMeta = {
  type: ReportType;
  generatedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  effectiveScope: ReportOption[];
  appliedFilters: Array<{ label: string; value: string }>;
  filters: ReportFilterOptions;
};

export type SalesReport = ReportMeta & {
  type: "sales";
  rows: Array<{
    id: string;
    verifiedAt: string;
    manualReceiptNumber: string;
    branch: string;
    customer: string;
    salespersonId: string | null;
    salesperson: string;
    encoder: string;
    source: "Direct Sale" | "Customer Order";
    paymentMethod: string;
    units: number;
    discountAmount: number;
    totalAmount: number;
    verificationStatus: "VERIFIED";
  }>;
  branchTotals: Array<{ branch: string; transactionCount: number; units: number; totalAmount: number; percentage: number }>;
  grandTotal: { transactionCount: number; units: number; totalDiscount: number; averageSale: number; totalAmount: number };
};

export type SalespersonSalesReport = Omit<SalesReport, "type"> & {
  type: "salesperson-sales";
  salespersonTotals: Array<{
    salespersonId: string | null;
    salesperson: string;
    transactionCount: number;
    units: number;
    totalDiscount: number;
    averageSale: number;
    totalAmount: number;
    percentage: number;
  }>;
};

export type InventoryReportRow = {
  id: string;
  productId: string;
  itemCode: string;
  product: string;
  category: string;
  brand: string;
  productStatus: string;
  available: number;
  availableByLocation: Record<string, number>;
};

export type InventorySummaryReport = ReportMeta & {
  type: "inventory-summary";
  rows: InventoryReportRow[];
  branchTotals: Array<{ locationId: string; available: number }>;
  totals: {
    productCount: number;
    locationCount: number;
    available: number;
  };
};

export type ReturnsWarrantyReport = ReportMeta & {
  type: "returns-warranty";
  rows: Array<{
    id: string;
    recordType: "Backjob" | "Customer Warranty" | "Supplier Claim";
    caseDate: string;
    reference: string;
    originalReference: string;
    branch: string;
    party: string;
    product: string;
    quantity: number | null;
    assignedPersonnel: string;
    salesperson: string;
    status: string;
    resolution: string;
    targetDate: string | null;
    overdue: boolean;
    linkedCase: string;
    unresolvedQuarantinedQuantity: number;
    backjobChargeAmount: number | null;
    supplierRefundAmount: number;
    supplierCreditAmount: number;
  }>;
  totals: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
    unresolvedQuarantinedQuantity: number;
    backjobChargeAmount: number;
    supplierRefundAmount: number;
    supplierCreditAmount: number;
    byType: ReportBreakdown[];
    byStatus: ReportBreakdown[];
    byBranch: ReportBreakdown[];
    byResolution: ReportBreakdown[];
  };
};

export type ReportResult = SalesReport | SalespersonSalesReport | InventorySummaryReport | ReturnsWarrantyReport;
