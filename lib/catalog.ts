export type ProductStatus = "Active" | "Inactive";

export type VehicleCompatibility = {
  id?: string;
  make: string;
  model: string;
  /** What the encoder typed: "2016-2020", "2019 up", "universal", or blank. */
  yearsLabel: string;
  startYear: number | null;
  endYear: number | null;
};

/**
 * Turns a typed fitment label into the numeric range the product search
 * compares against.
 *
 * Anything it cannot read becomes an open range. That is deliberate: at a parts
 * counter, showing a part that turns out not to fit costs a glance at the
 * label, while hiding one that does fit costs a sale. The label is always kept
 * verbatim, so the person reading the row sees exactly what was written.
 */
export function parseVehicleYears(label: string): { startYear: number | null; endYear: number | null } {
  const open = { startYear: null, endYear: null };
  const text = label.trim().toLowerCase();
  if (!text) return open;

  // "universal", "all", "all years" and friends carry no range at all.
  if (/^(universal|all|all years|any|n\/a|-)$/.test(text)) return open;

  const years = text.match(/\b(1[89]\d{2}|2[01]\d{2})\b/g);
  if (!years) return open;

  // Two ranges in one label ("2010-2014, 2018-2022") cannot be said with two
  // numbers without claiming the gap, so leave it open and let the label speak.
  const separators = (text.match(/[,;]|\band\b/g) ?? []).length;
  if (separators > 0) return open;

  const first = Number(years[0]);
  if (years.length === 1) {
    // "2019 up", "2019+", "2019 onwards", "2019-present": start, no end.
    return /(\bup\b|\+|onward|present|current|newer|later)/.test(text)
      ? { startYear: first, endYear: null }
      : { startYear: first, endYear: first };
  }

  const last = Number(years[years.length - 1]);
  return first <= last ? { startYear: first, endYear: last } : { startYear: last, endYear: first };
}

export type ProductRow = {
  id: string;
  imageUrl: string | null;
  itemCode: string;
  name: string;
  category: string;
  brand: string;
  price: number | null;
  reorderLevel: number;
  warrantyDurationMonths: number | null;
  status: ProductStatus;
  description?: string;
  vehicleCompatibilities: VehicleCompatibility[];
  canEditItemCode: boolean;
  canDelete: boolean;
  hasStock: boolean;
};

export type ProductsApiResponse = {
  data: ProductRow[];
  meta: PaginationMeta;
  filterOptions: {
    categories: string[];
    brands: string[];
    vehicleMakes: string[];
    vehicleModels: string[];
  };
  summary: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    withReorderLevel: number;
  };
};

export type InventoryStatus = "In Stock" | "Low Stock" | "Out of Stock";

export type InventoryRow = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  location: string;
  onHand: number;
  reserved: number;
  quarantined: number;
  reorderLevel: number;
  unitCost: number;
  lastUpdated: string;
  status: InventoryStatus;
};

export type InventoryApiResponse = {
  data: InventoryRow[];
  meta: PaginationMeta;
  summary: {
    totalProducts: number;
    totalUnits: number;
    needsRestock: number;
    incomingItems: number;
    incomingItemsLabel: string;
  };
};

export type InventoryMovementRow = {
  id: string;
  date: string;
  type: string;
  qty: number;
  reference: string;
  remarks: string;
  location: string;
  itemCode: string;
  itemName: string;
};

export type InventoryMovementsApiResponse = {
  data: InventoryMovementRow[];
  meta: PaginationMeta;
};

type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type QueryValue = string | number;

async function fetchJson<T>(path: string, query: Record<string, QueryValue>) {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const response = await fetch(`${path}?${searchParams.toString()}`, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "Unable to load data");
  }

  return (await response.json()) as T;
}

async function sendJson<T>(path: string, method: "PATCH" | "POST", body: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(payload?.error?.message ?? "Unable to save data");
  }

  return (await response.json()) as T;
}

export function fetchProducts(query: Record<string, QueryValue>) {
  return fetchJson<ProductsApiResponse>("/api/products", query);
}

export function fetchInventory(query: Record<string, QueryValue>) {
  return fetchJson<InventoryApiResponse>("/api/inventory", query);
}

export function fetchInventoryMovements(query: Record<string, QueryValue>) {
  return fetchJson<InventoryMovementsApiResponse>("/api/inventory/movements", query);
}

export function correctInventory(
  balanceId: string,
  input: {
    type: "increase" | "decrease";
    quantity: number;
    reference?: string;
    reason: string;
    remarks?: string;
  },
) {
  return sendJson<{ data: InventoryRow }>(`/api/inventory/${balanceId}/adjustment`, "POST", input);
}

export function updateInventoryUnitCost(
  balanceId: string,
  input: { unitCost: number; reference?: string; reason: string; remarks?: string },
) {
  return sendJson<{ data: InventoryRow }>(`/api/inventory/${balanceId}`, "PATCH", input);
}
