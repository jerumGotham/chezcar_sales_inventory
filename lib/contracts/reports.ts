export const REPORT_TYPES = [
  "sales",
  "salesperson-sales",
  "inventory-summary",
  "stock-movement",
  "returns-warranty",
] as const;

export const SALE_SOURCES = ["DIRECT_SALE", "CUSTOMER_ORDER"] as const;
/**
 * Which date the sales period is measured on. SALE_DATE is the day the receipt
 * was issued, so a printed month stops changing as Accounting catches up;
 * VERIFIED_DATE is the day Accounting confirmed it, which is what Accounting
 * itself reconciles against.
 */
export const SALE_DATE_BASES = ["SALE_DATE", "VERIFIED_DATE"] as const;
export type SaleDateBasis = (typeof SALE_DATE_BASES)[number];
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
  dateBasis: SaleDateBasis;
  /** Receipts issued inside the period that Accounting has not confirmed yet. */
  pending: { count: number; amount: number };
  rows: Array<{
    id: string;
    soldAt: string;
    verifiedAt: string;
    manualReceiptNumber: string;
    branch: string;
    customer: string;
    salespersonId: string | null;
    salesperson: string;
    encoder: string;
    // One row per verified receipt: the money is counted on the day Accounting
    // verified that receipt, so a downpayment and its order's release are
    // separate rows and no peso is counted twice.
    source: "Direct Sale" | "Order Downpayment" | "Order Payment" | "Order Release";
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

/**
 * How a product behaved at one branch over the period. MOVEMENT_NONE is the one
 * that matters most in a monthly review: stock sitting on the shelf that nobody
 * bought. The rest is a plain cover calculation, not a hidden score.
 */
export const STOCK_MOVEMENT_GRADES = ["FAST", "SLOW", "NO_MOVEMENT"] as const;
export type StockMovementGrade = (typeof STOCK_MOVEMENT_GRADES)[number];

/** A product with stock left to cover more than this many periods is slow. */
export const SLOW_MOVING_COVER_PERIODS = 3;

export function stockMovementGrade(soldUnits: number, available: number): StockMovementGrade {
  if (soldUnits <= 0) return "NO_MOVEMENT";
  return available / soldUnits > SLOW_MOVING_COVER_PERIODS ? "SLOW" : "FAST";
}

export type StockMovementReport = ReportMeta & {
  type: "stock-movement";
  rows: Array<{
    id: string;
    productId: string;
    locationId: string;
    itemCode: string;
    product: string;
    category: string;
    brand: string;
    branch: string;
    onHand: number;
    reserved: number;
    quarantined: number;
    available: number;
    soldUnits: number;
    soldAmount: number;
    lastSoldAt: string | null;
    /** Periods of stock left at this period's rate; null when nothing sold. */
    coverPeriods: number | null;
    grade: StockMovementGrade;
  }>;
  totals: {
    productCount: number;
    locationCount: number;
    onHand: number;
    available: number;
    soldUnits: number;
    soldAmount: number;
    noMovementCount: number;
    slowCount: number;
    fastCount: number;
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

export type ReportResult = SalesReport | SalespersonSalesReport | InventorySummaryReport | StockMovementReport | ReturnsWarrantyReport;
