export type ProductStatus = "Active" | "Inactive";

export type ProductRow = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  brand: string;
  price: number | null;
  reorderLevel: number;
  status: ProductStatus;
  description?: string;
  canEditItemCode: boolean;
  canDelete: boolean;
  hasStock: boolean;
};

export type ProductsApiResponse = {
  data: ProductRow[];
  meta: PaginationMeta;
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
