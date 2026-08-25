export type ProductStatus = "Active" | "Inactive";

export type ProductRow = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  price: number | null;
  reorderLevel: number;
  status: ProductStatus;
  description?: string;
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

export function fetchProducts(query: Record<string, QueryValue>) {
  return fetchJson<ProductsApiResponse>("/api/products", query);
}

export function fetchInventory(query: Record<string, QueryValue>) {
  return fetchJson<InventoryApiResponse>("/api/inventory", query);
}
