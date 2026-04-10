"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package2,
  Tags,
  AlertTriangle,
  Ban,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SelectOption = {
  value: string;
  label: string;
};

type ProductStatus = "Active" | "Inactive";

type ProductRow = {
  id: string;
  itemCode: string;
  name: string;
  category: string;
  price: number;
  reorderLevel: number;
  status: ProductStatus;
  description?: string;
};

type ProductsApiResponse = {
  data: ProductRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    withReorderLevel: number;
  };
};

const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Categories" },
  { value: "Tint", label: "Tint" },
  { value: "Seat Cover", label: "Seat Cover" },
  { value: "Audio", label: "Audio" },
  { value: "Exterior", label: "Exterior" },
  { value: "Lighting", label: "Lighting" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Statuses" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
];

const MOCK_PRODUCTS: ProductRow[] = [
  {
    id: "PROD-1001",
    itemCode: "ITM-0001",
    name: "3M Tint Medium Black",
    category: "Tint",
    price: 8500,
    reorderLevel: 5,
    status: "Active",
    description: "Premium medium black tint for SUVs and sedans",
  },
  {
    id: "PROD-1002",
    itemCode: "ITM-0002",
    name: "Seat Cover Set",
    category: "Seat Cover",
    price: 6000,
    reorderLevel: 4,
    status: "Active",
    description: "Leatherette seat cover set",
  },
  {
    id: "PROD-1003",
    itemCode: "ITM-0003",
    name: "Android Head Unit 9in",
    category: "Audio",
    price: 12500,
    reorderLevel: 5,
    status: "Active",
    description: "Touchscreen Android head unit with CarPlay",
  },
  {
    id: "PROD-1004",
    itemCode: "ITM-0004",
    name: "LED Fog Lamp Set",
    category: "Lighting",
    price: 3500,
    reorderLevel: 3,
    status: "Active",
    description: "Bright LED fog lamps for better visibility",
  },
  {
    id: "PROD-1005",
    itemCode: "ITM-0005",
    name: "Roof Rack",
    category: "Exterior",
    price: 9500,
    reorderLevel: 2,
    status: "Inactive",
    description: "Heavy duty roof rack",
  },
  {
    id: "PROD-1006",
    itemCode: "ITM-0006",
    name: "Nano Ceramic Tint",
    category: "Tint",
    price: 14500,
    reorderLevel: 4,
    status: "Active",
    description: "High heat rejection ceramic tint",
  },
  {
    id: "PROD-1007",
    itemCode: "ITM-0007",
    name: "Amplifier 4 Channel",
    category: "Audio",
    price: 7800,
    reorderLevel: 3,
    status: "Active",
    description: "4-channel car amplifier",
  },
  {
    id: "PROD-1008",
    itemCode: "ITM-0008",
    name: "Premium Seat Cover Beige",
    category: "Seat Cover",
    price: 7200,
    reorderLevel: 3,
    status: "Active",
    description: "Premium beige seat cover set",
  },
  {
    id: "PROD-1009",
    itemCode: "ITM-0009",
    name: "LED Headlight Bulb",
    category: "Lighting",
    price: 2200,
    reorderLevel: 5,
    status: "Active",
    description: "LED headlight bulb pair",
  },
  {
    id: "PROD-1010",
    itemCode: "ITM-0010",
    name: "Rear Spoiler",
    category: "Exterior",
    price: 6800,
    reorderLevel: 2,
    status: "Inactive",
    description: "Sporty rear spoiler",
  },
];

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

function getStatusBadgeClass(status: ProductStatus) {
  if (status === "Active") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  return "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
}

async function mockFetchProducts(params: {
  page: number;
  pageSize: number;
  itemCode: string;
  name: string;
  category: string;
  status: string;
}): Promise<ProductsApiResponse> {
  const { page, pageSize, itemCode, name, category, status } = params;

  await new Promise((resolve) => setTimeout(resolve, 400));

  let filtered = [...MOCK_PRODUCTS];

  if (itemCode.trim()) {
    const keyword = itemCode.trim().toLowerCase();
    filtered = filtered.filter((product) =>
      product.itemCode.toLowerCase().includes(keyword),
    );
  }

  if (name.trim()) {
    const keyword = name.trim().toLowerCase();
    filtered = filtered.filter((product) =>
      product.name.toLowerCase().includes(keyword),
    );
  }

  if (category !== "all") {
    filtered = filtered.filter((product) => product.category === category);
  }

  if (status !== "all") {
    filtered = filtered.filter((product) => product.status === status);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginated = filtered.slice(startIndex, endIndex);

  return {
    data: paginated,
    meta: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      totalProducts: MOCK_PRODUCTS.length,
      activeProducts: MOCK_PRODUCTS.filter((item) => item.status === "Active")
        .length,
      inactiveProducts: MOCK_PRODUCTS.filter(
        (item) => item.status === "Inactive",
      ).length,
      withReorderLevel: MOCK_PRODUCTS.filter((item) => item.reorderLevel > 0)
        .length,
    },
  };
}

const reactSelectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#10b981" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#10b981",
    },
  }),
  valueContainer: (base: any) => ({
    ...base,
    paddingLeft: "10px",
    paddingRight: "10px",
  }),
  input: (base: any) => ({
    ...base,
    color: "#0f172a",
  }),
  placeholder: (base: any) => ({
    ...base,
    color: "#94a3b8",
    fontSize: "14px",
  }),
  menu: (base: any) => ({
    ...base,
    borderRadius: "0.75rem",
    overflow: "hidden",
    zIndex: 50,
  }),
  option: (base: any, state: any) => ({
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

export default function ProductsPage() {
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SelectOption>(CATEGORY_OPTIONS[0]);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedItemCode, setAppliedItemCode] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(
    null,
  );
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "products-master-list",
      {
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      mockFetchProducts({
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        status: appliedStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
  const summary = data?.summary ?? {
    totalProducts: 0,
    activeProducts: 0,
    inactiveProducts: 0,
    withReorderLevel: 0,
  };

  const showingFrom = useMemo(() => {
    if (meta.total === 0) return 0;
    return (meta.page - 1) * meta.pageSize + 1;
  }, [meta]);

  const showingTo = useMemo(() => {
    if (meta.total === 0) return 0;
    return Math.min(meta.page * meta.pageSize, meta.total);
  }, [meta]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedItemCode(itemCode);
    setAppliedName(name);
    setAppliedCategory(category.value);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setItemCode("");
    setName("");
    setCategory(CATEGORY_OPTIONS[0]);
    setStatus(STATUS_OPTIONS[0]);

    setAppliedItemCode("");
    setAppliedName("");
    setAppliedCategory("all");
    setAppliedStatus("all");
    setPage(1);
  };

  return (
    <>
      <PageShell
        title="Products"
        subtitle="Maintain the product master list with item code, category, price, reorder level, description, and status."
        actions={
          <>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                setSelectedProduct(null);
                setIsEditOpen(true);
              }}
            >
              Add Product
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Total Products</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.totalProducts}
                </h3>
                <p className="mt-2 text-sm text-sky-600">
                  Master product catalog
                </p>
              </div>
              <div className="rounded-full bg-sky-50 p-2">
                <Package2 className="h-5 w-5 text-sky-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Active Products</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.activeProducts}
                </h3>
                <p className="mt-2 text-sm text-emerald-600">
                  Available for use in transactions
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 p-2">
                <Tags className="h-5 w-5 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">With Reorder Level</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.withReorderLevel}
                </h3>
                <p className="mt-2 text-sm text-amber-600">
                  Configured for stock monitoring
                </p>
              </div>
              <div className="rounded-full bg-amber-50 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Inactive Products</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.inactiveProducts}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Hidden from active usage
                </p>
              </div>
              <div className="rounded-full bg-slate-100 p-2">
                <Ban className="h-5 w-5 text-slate-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="Item Code"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
            />

            <Input
              placeholder="Search product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="w-full">
              <Select
                instanceId="products-category-filter"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(option) =>
                  setCategory(option ?? CATEGORY_OPTIONS[0])
                }
                isSearchable
                placeholder="Select category"
                styles={reactSelectStyles}
              />
            </div>

            <div className="w-full">
              <Select
                instanceId="products-status-filter"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(option) => setStatus(option ?? STATUS_OPTIONS[0])}
                isSearchable
                placeholder="Select status"
                styles={reactSelectStyles}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleApplyFilters}
              >
                Apply Filters
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={handleResetFilters}
              >
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Product Master List
                </h3>
                <p className="text-sm text-slate-500">
                  Showing {showingFrom} to {showingTo} of {meta.total} products
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1150px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Item Code
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Name
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Price
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reorder Level
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Description
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-16 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading products...
                        </div>
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No products found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((product) => (
                      <tr
                        key={product.id}
                        className="border-b transition-colors hover:bg-slate-50"
                      >
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {product.itemCode}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-foreground">
                          {product.name}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {product.category}
                        </td>
                        <td className="px-5 py-4 text-sm font-medium text-slate-700">
                          {formatPeso(product.price)}
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {product.reorderLevel}
                        </td>
                        <td className="px-5 py-4 text-sm">
                          <Badge
                            className={getStatusBadgeClass(product.status)}
                          >
                            {product.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          <span className="line-clamp-1">
                            {product.description || "-"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-row gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setIsEditOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setIsEditOpen(true);
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={meta.page <= 1 || isFetching}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((prev) => Math.min(prev + 1, meta.totalPages || 1))
                  }
                  disabled={meta.page >= meta.totalPages || isFetching}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageShell>

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setSelectedProduct(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription>
              {selectedProduct
                ? "Update product master details such as item code, category, pricing, reorder level, and status."
                : "Create a new product in the master list. Stock will be managed in the Inventory module."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="itemCode">Item Code</Label>
                <Input
                  id="itemCode"
                  defaultValue={selectedProduct?.itemCode ?? ""}
                  placeholder="ITM-0013"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="productName">Product Name</Label>
                <Input
                  id="productName"
                  defaultValue={selectedProduct?.name ?? ""}
                  placeholder="Product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  defaultValue={selectedProduct?.category ?? ""}
                  placeholder="Tint"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  defaultValue={selectedProduct?.price ?? 0}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorderLevel">Reorder Level</Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  defaultValue={selectedProduct?.reorderLevel ?? 0}
                />
                <p className="text-xs text-slate-500">
                  Used by inventory monitoring to identify low stock items.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Input
                  id="status"
                  defaultValue={selectedProduct?.status ?? "Active"}
                  placeholder="Active"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  defaultValue={selectedProduct?.description ?? ""}
                  placeholder="Product description"
                />
              </div>
            </div>

            {!selectedProduct && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                After creating this product, use the Inventory module to receive
                opening stock into Main Warehouse or directly to a branch.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>

            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setIsEditOpen(false)}
            >
              {selectedProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
