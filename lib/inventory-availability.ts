export type InventoryAvailabilityStatus =
  | "In Stock"
  | "Low Stock"
  | "Out of Stock";

export type InventoryAvailabilityRow = {
  product: {
    id: string;
    itemCode: string;
    name: string;
    category: string;
  };
  location: {
    id: string;
    code: string;
    name: string;
    type: "WAREHOUSE" | "BRANCH";
  };
  onHand: number;
  reserved: number;
  available: number;
  status: InventoryAvailabilityStatus;
};

export type InventoryAvailabilityResponse = {
  data: InventoryAvailabilityRow[];
  filterOptions: {
    products: Array<{ id: string; itemCode: string; name: string }>;
    categories: string[];
    locations: Array<{
      id: string;
      code: string;
      name: string;
      type: "WAREHOUSE" | "BRANCH";
    }>;
  };
};

type QueryValue = string | number;

export async function fetchInventoryAvailability(
  query: Record<string, QueryValue>,
) {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  const response = await fetch(
    `/api/inventory/availability?${searchParams.toString()}`,
    { credentials: "same-origin" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "Unable to load inventory availability");
  }

  return (await response.json()) as InventoryAvailabilityResponse;
}
