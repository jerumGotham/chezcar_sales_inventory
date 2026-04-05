import type { StylesConfig } from "react-select";

export type SelectOption = {
  value: string;
  label: string;
};

export type UserRole = "OWNER" | "ADMIN" | "BRANCH_MANAGER";

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

export type ProductGroupRow = {
  itemCode: string;
  name: string;
  category: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  reorderLevel: number;
  unitCost: number;
  locations: InventoryRow[];
  status: InventoryStatus;
  lastUpdated: string;
};

export type StockMovement = {
  id: string;
  date: string;
  type:
    | "Opening Balance"
    | "Receive"
    | "Adjustment +"
    | "Adjustment -"
    | "Transfer In"
    | "Transfer Out"
    | "Sale"
    | "Customer Order Reserve"
    | "Job Order Usage";
  qty: number;
  reference: string;
  remarks: string;
  location: string;
  itemCode: string;
  itemName: string;
};

export type BranchAvailabilityRow = {
  itemCode: string;
  itemName: string;
  category: string;
  location: string;
  onHand: number;
  reserved: number;
  available: number;
  status: InventoryStatus;
};

export type InventoryApiResponse = {
  data: InventoryRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalItems: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
};

export type BatchLineRow = {
  id: string;
  product: SelectOption | null;
  qty: string;
};

export const USER_ROLE: UserRole = "ADMIN";
export const MAIN_WAREHOUSE = "Main Warehouse";

export const LOCATION_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Locations" },
  { value: MAIN_WAREHOUSE, label: MAIN_WAREHOUSE },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

export const BRANCH_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Branches" },
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

export const BRANCH_OPTIONS_NO_ALL = BRANCH_OPTIONS.filter(
  (item) => item.value !== "all",
);

export const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Categories" },
  { value: "Tint", label: "Tint" },
  { value: "Seat Cover", label: "Seat Cover" },
  { value: "Audio", label: "Audio" },
  { value: "Exterior", label: "Exterior" },
  { value: "Lighting", label: "Lighting" },
];

export const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "In Stock", label: "In Stock" },
  { value: "Low Stock", label: "Low Stock" },
  { value: "Out of Stock", label: "Out of Stock" },
];

export const PRODUCT_OPTIONS: SelectOption[] = [
  { value: "ITM-0001", label: "ITM-0001 - 3M Tint Medium Black" },
  { value: "ITM-0002", label: "ITM-0002 - Seat Cover Set" },
  { value: "ITM-0003", label: "ITM-0003 - Android Head Unit 9in" },
  { value: "ITM-0004", label: "ITM-0004 - LED Fog Lamp Set" },
  { value: "ITM-0005", label: "ITM-0005 - Roof Rack" },
  { value: "ITM-0006", label: "ITM-0006 - Nano Ceramic Tint" },
];

export const ADJUSTMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "increase", label: "Increase Stock" },
  { value: "decrease", label: "Decrease Stock" },
];

export const MOVEMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Movement Types" },
  { value: "Opening Balance", label: "Opening Balance" },
  { value: "Receive", label: "Receive" },
  { value: "Adjustment +", label: "Adjustment +" },
  { value: "Adjustment -", label: "Adjustment -" },
  { value: "Transfer In", label: "Transfer In" },
  { value: "Transfer Out", label: "Transfer Out" },
  { value: "Sale", label: "Sale" },
  { value: "Customer Order Reserve", label: "Customer Order Reserve" },
  { value: "Job Order Usage", label: "Job Order Usage" },
];

export const MOCK_INVENTORY: InventoryRow[] = [
  {
    id: "INV-1001",
    itemCode: "ITM-0001",
    name: "3M Tint Medium Black",
    category: "Tint",
    location: MAIN_WAREHOUSE,
    onHand: 30,
    reserved: 0,
    reorderLevel: 5,
    unitCost: 6200,
    lastUpdated: "2026-04-04 09:15 AM",
    status: "In Stock",
  },
  {
    id: "INV-1002",
    itemCode: "ITM-0001",
    name: "3M Tint Medium Black",
    category: "Tint",
    location: "QC Main",
    onHand: 10,
    reserved: 2,
    reorderLevel: 5,
    unitCost: 6200,
    lastUpdated: "2026-04-04 10:30 AM",
    status: "In Stock",
  },
  {
    id: "INV-1003",
    itemCode: "ITM-0001",
    name: "3M Tint Medium Black",
    category: "Tint",
    location: "Makati",
    onHand: 5,
    reserved: 1,
    reorderLevel: 5,
    unitCost: 6200,
    lastUpdated: "2026-04-03 04:40 PM",
    status: "Low Stock",
  },
  {
    id: "INV-1004",
    itemCode: "ITM-0002",
    name: "Seat Cover Set",
    category: "Seat Cover",
    location: MAIN_WAREHOUSE,
    onHand: 20,
    reserved: 0,
    reorderLevel: 4,
    unitCost: 4300,
    lastUpdated: "2026-04-04 08:00 AM",
    status: "In Stock",
  },
  {
    id: "INV-1005",
    itemCode: "ITM-0002",
    name: "Seat Cover Set",
    category: "Seat Cover",
    location: "QC Main",
    onHand: 8,
    reserved: 1,
    reorderLevel: 4,
    unitCost: 4300,
    lastUpdated: "2026-04-04 08:45 AM",
    status: "In Stock",
  },
  {
    id: "INV-1006",
    itemCode: "ITM-0003",
    name: "Android Head Unit 9in",
    category: "Audio",
    location: MAIN_WAREHOUSE,
    onHand: 4,
    reserved: 0,
    reorderLevel: 5,
    unitCost: 9300,
    lastUpdated: "2026-04-03 11:15 AM",
    status: "Low Stock",
  },
  {
    id: "INV-1007",
    itemCode: "ITM-0003",
    name: "Android Head Unit 9in",
    category: "Audio",
    location: "Pasig",
    onHand: 3,
    reserved: 1,
    reorderLevel: 5,
    unitCost: 9300,
    lastUpdated: "2026-04-03 03:10 PM",
    status: "Low Stock",
  },
  {
    id: "INV-1008",
    itemCode: "ITM-0004",
    name: "LED Fog Lamp Set",
    category: "Lighting",
    location: MAIN_WAREHOUSE,
    onHand: 0,
    reserved: 0,
    reorderLevel: 3,
    unitCost: 1800,
    lastUpdated: "2026-04-02 01:20 PM",
    status: "Out of Stock",
  },
  {
    id: "INV-1009",
    itemCode: "ITM-0004",
    name: "LED Fog Lamp Set",
    category: "Lighting",
    location: "QC Main",
    onHand: 0,
    reserved: 0,
    reorderLevel: 3,
    unitCost: 1800,
    lastUpdated: "2026-04-02 01:25 PM",
    status: "Out of Stock",
  },
  {
    id: "INV-1010",
    itemCode: "ITM-0005",
    name: "Roof Rack",
    category: "Exterior",
    location: MAIN_WAREHOUSE,
    onHand: 12,
    reserved: 0,
    reorderLevel: 2,
    unitCost: 7100,
    lastUpdated: "2026-04-04 07:50 AM",
    status: "In Stock",
  },
  {
    id: "INV-1011",
    itemCode: "ITM-0006",
    name: "Nano Ceramic Tint",
    category: "Tint",
    location: MAIN_WAREHOUSE,
    onHand: 6,
    reserved: 0,
    reorderLevel: 4,
    unitCost: 9800,
    lastUpdated: "2026-04-03 09:05 AM",
    status: "In Stock",
  },
  {
    id: "INV-1012",
    itemCode: "ITM-0006",
    name: "Nano Ceramic Tint",
    category: "Tint",
    location: "Pasig",
    onHand: 2,
    reserved: 0,
    reorderLevel: 4,
    unitCost: 9800,
    lastUpdated: "2026-04-03 12:00 PM",
    status: "Low Stock",
  },
];

export const MOCK_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: "MOV-001",
    date: "2026-04-04 09:15 AM",
    type: "Receive",
    qty: 20,
    reference: "RCV-00045",
    remarks: "Supplier delivery to Main Warehouse",
    location: MAIN_WAREHOUSE,
    itemCode: "ITM-0001",
    itemName: "3M Tint Medium Black",
  },
  {
    id: "MOV-002",
    date: "2026-04-04 10:10 AM",
    type: "Transfer Out",
    qty: -10,
    reference: "TRF-00011",
    remarks: "Transferred to QC Main",
    location: MAIN_WAREHOUSE,
    itemCode: "ITM-0001",
    itemName: "3M Tint Medium Black",
  },
  {
    id: "MOV-003",
    date: "2026-04-04 10:30 AM",
    type: "Transfer In",
    qty: 10,
    reference: "TRF-00011",
    remarks: "Received from Main Warehouse",
    location: "QC Main",
    itemCode: "ITM-0001",
    itemName: "3M Tint Medium Black",
  },
  {
    id: "MOV-004",
    date: "2026-04-03 04:40 PM",
    type: "Transfer In",
    qty: 5,
    reference: "TRF-00009",
    remarks: "Received from Main Warehouse",
    location: "Makati",
    itemCode: "ITM-0001",
    itemName: "3M Tint Medium Black",
  },
  {
    id: "MOV-005",
    date: "2026-04-03 11:15 AM",
    type: "Opening Balance",
    qty: 4,
    reference: "OB-00003",
    remarks: "Initial stock setup",
    location: MAIN_WAREHOUSE,
    itemCode: "ITM-0003",
    itemName: "Android Head Unit 9in",
  },
  {
    id: "MOV-006",
    date: "2026-04-03 03:10 PM",
    type: "Transfer In",
    qty: 3,
    reference: "TRF-00008",
    remarks: "Received from Main Warehouse",
    location: "Pasig",
    itemCode: "ITM-0003",
    itemName: "Android Head Unit 9in",
  },
  {
    id: "MOV-007",
    date: "2026-04-04 01:10 PM",
    type: "Sale",
    qty: -1,
    reference: "POS-00120",
    remarks: "Walk-in sale",
    location: "QC Main",
    itemCode: "ITM-0002",
    itemName: "Seat Cover Set",
  },
  {
    id: "MOV-008",
    date: "2026-04-04 02:45 PM",
    type: "Job Order Usage",
    qty: -1,
    reference: "JO-00054",
    remarks: "Installed on customer vehicle",
    location: "Pasig",
    itemCode: "ITM-0003",
    itemName: "Android Head Unit 9in",
  },
  {
    id: "MOV-009",
    date: "2026-04-04 03:15 PM",
    type: "Customer Order Reserve",
    qty: -1,
    reference: "CO-00031",
    remarks: "Reserved for pending release",
    location: "Makati",
    itemCode: "ITM-0001",
    itemName: "3M Tint Medium Black",
  },
];

export function getAvailableStock(row: InventoryRow) {
  return Math.max(row.onHand - row.reserved, 0);
}

export function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

export function getStockBadgeClass(status: InventoryStatus) {
  if (status === "In Stock") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  if (status === "Low Stock") {
    return "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50";
  }

  return "border border-red-200 bg-red-50 text-red-700 hover:bg-red-50";
}

export function getLocationBadgeClass(location: string) {
  if (location === MAIN_WAREHOUSE) {
    return "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-50";
}

export function createBatchLine(): BatchLineRow {
  return {
    id: Math.random().toString(36).slice(2),
    product: null,
    qty: "",
  };
}

export function getGroupedStatus(rows: InventoryRow[]): InventoryStatus {
  const hasInStock = rows.some((row) => row.status === "In Stock");
  const hasLowStock = rows.some((row) => row.status === "Low Stock");

  if (hasInStock) return "In Stock";
  if (hasLowStock) return "Low Stock";
  return "Out of Stock";
}

export async function mockFetchInventory(params: {
  page: number;
  pageSize: number;
  itemCode: string;
  name: string;
  category: string;
  location: string;
  status: string;
}): Promise<InventoryApiResponse> {
  const { page, pageSize, itemCode, name, category, location, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 300));

  let filtered = [...MOCK_INVENTORY];

  if (itemCode.trim()) {
    const keyword = itemCode.trim().toLowerCase();
    filtered = filtered.filter((item) =>
      item.itemCode.toLowerCase().includes(keyword),
    );
  }

  if (name.trim()) {
    const keyword = name.trim().toLowerCase();
    filtered = filtered.filter((item) =>
      item.name.toLowerCase().includes(keyword),
    );
  }

  if (category !== "all") {
    filtered = filtered.filter((item) => item.category === category);
  }

  if (location !== "all") {
    filtered = filtered.filter((item) => item.location === location);
  }

  if (status !== "all") {
    filtered = filtered.filter((item) => item.status === status);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    data: filtered.slice(startIndex, endIndex),
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      totalItems: MOCK_INVENTORY.length,
      inStock: MOCK_INVENTORY.filter((item) => item.status === "In Stock")
        .length,
      lowStock: MOCK_INVENTORY.filter((item) => item.status === "Low Stock")
        .length,
      outOfStock: MOCK_INVENTORY.filter(
        (item) => item.status === "Out of Stock",
      ).length,
    },
  };
}

export const reactSelectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#10b981" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#10b981",
    },
  }),
  valueContainer: (base) => ({
    ...base,
    paddingLeft: "10px",
    paddingRight: "10px",
  }),
  input: (base) => ({
    ...base,
    color: "#0f172a",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
    fontSize: "14px",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.75rem",
    overflow: "hidden",
    zIndex: 70,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#10b981"
      : state.isFocused
        ? "#ecfdf5"
        : "#ffffff",
    color: state.isSelected ? "#ffffff" : "#0f172a",
    cursor: "pointer",
  }),
};
