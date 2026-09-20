export const AUDIT_CATEGORIES = [
  "Access",
  "Master Data",
  "Sales",
  "Receipt Verification",
  "Customer Orders",
  "Inventory",
  "Stock Transfers",
  "Returns & Warranty",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditItemDto = {
  name: string;
  quantity?: number;
  amount?: string;
};

export type AuditEntryDto = {
  id: string;
  occurredAt: string;
  category: AuditCategory;
  action: string;
  actor: string;
  reference: string;
  location: string;
  details: string;
  /** Line items behind the entry: products bought, moved, or claimed. */
  items?: AuditItemDto[];
  /** Extra label/value pairs shown only in the details view. */
  facts?: Array<{ label: string; value: string }>;
};

export type AuditTrailDto = {
  data: AuditEntryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; truncated: boolean };
  filters: { categories: readonly AuditCategory[] };
};
