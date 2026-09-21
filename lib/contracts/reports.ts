export const REPORT_TYPES = [
  "sales",
  "salesperson-sales",
  "inventory-summary",
  "stock-movement",
  "returns-warranty",
] as const;

export const SALE_SOURCES = ["DIRECT_SALE", "CUSTOMER_ORDER"] as const;
/**
 * One choice decides both which receipts the sales period contains and which
 * date it is measured on, because the two are not independent: a receipt
 * Accounting has not confirmed has no verification date to be measured by.
 *
 * - SALE_DATE, the default, dates every receipt by the day it was issued and
 *   shows confirmed and unconfirmed side by side, with an unconfirmed receipt
 *   marked in place of its verification date.
 * - VERIFIED_DATE dates by the day Accounting confirmed the receipt, so only
 *   confirmed receipts can appear and every row is Y.
 * - UNVERIFIED dates by the day the receipt was issued and shows only what
 *   Accounting has not confirmed, so every row is N.
 */
export const SALES_VIEWS = ["SALE_DATE", "VERIFIED_DATE", "UNVERIFIED"] as const;
export type SalesView = (typeof SALES_VIEWS)[number];

export const SALES_VIEW_LABELS: Record<SalesView, string> = {
  SALE_DATE: "Sale date (all receipts)",
  VERIFIED_DATE: "Verification date (verified only)",
  UNVERIFIED: "Not verified only",
};
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
  view: SalesView;
  /** Receipts issued inside the period that Accounting has not confirmed yet. */
  pending: { count: number; amount: number };
  /**
   * The verified and unverified halves of what is on the page, kept apart so a
   * combined view can never be read as confirmed revenue.
   */
  verifiedTotal: { transactionCount: number; totalAmount: number };
  unverifiedTotal: { transactionCount: number; totalAmount: number };
  rows: Array<{
    id: string;
    soldAt: string;
    /** Null until Accounting confirms the receipt. */
    verifiedAt: string | null;
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
    verificationStatus: "VERIFIED" | "UNVERIFIED" | "MISMATCH_REPORTED";
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
 * How quickly a product sold at one branch over the period, measured as the
 * average number of days between sales. NO_MOVEMENT is the one that matters
 * most in a monthly review: stock nobody bought at all.
 */
export const STOCK_MOVEMENT_GRADES = ["FAST", "SLOW", "NO_MOVEMENT"] as const;
export type StockMovementGrade = (typeof STOCK_MOVEMENT_GRADES)[number];

/** Selling at least this often counts as fast. One a week by default. */
export const FAST_MOVING_DAYS_PER_SALE = 7;

/** Average days between sales; null when the product did not sell at all. */
export function daysPerSale(soldUnits: number, periodDays: number) {
  if (soldUnits <= 0 || periodDays <= 0) return null;
  return periodDays / soldUnits;
}

export function stockMovementGrade(soldUnits: number, periodDays: number): StockMovementGrade {
  const pace = daysPerSale(soldUnits, periodDays);
  if (pace === null) return "NO_MOVEMENT";
  return pace > FAST_MOVING_DAYS_PER_SALE ? "SLOW" : "FAST";
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
    /** Average days between sales in the period; null when nothing sold. */
    daysPerSale: number | null;
    grade: StockMovementGrade;
  }>;
  /** Days in the applied period, which is what the pace is measured against. */
  periodDays: number;
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
