"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Select from "react-select";
import type { StylesConfig } from "react-select";
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
import {
  fetchProducts,
  type ProductRow,
  type ProductStatus,
} from "@/lib/catalog";
import { useShellAccess } from "@/components/shell-access-context";

type SelectOption = {
  value: string;
  label: string;
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

const STOCK_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All Stock" },
  { value: "has-stock", label: "Has Stock" },
  { value: "no-stock", label: "No Stock" },
  { value: "inactive-with-stock", label: "Inactive With Stock" },
];

type ProductForm = {
  itemCode: string;
  name: string;
  category: string;
  brand: string;
  description: string;
  price: string;
  reorderLevel: string;
  status: "ACTIVE" | "INACTIVE";
};

const EMPTY_PRODUCT_FORM: ProductForm = {
  itemCode: "",
  name: "",
  category: "",
  brand: "",
  description: "",
  price: "",
  reorderLevel: "0",
  status: "ACTIVE",
};

async function productRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(json?.error?.message ?? "Unable to save product");
  }

  return json;
}

function formatPeso(value: number | null) {
  return value === null ? "—" : `₱${value.toLocaleString("en-PH")}`;
}

function getStatusBadgeClass(status: ProductStatus) {
  if (status === "Active") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
  }

  return "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
}

const reactSelectStyles: StylesConfig<SelectOption, false> = {
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
    zIndex: 50,
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

export default function ProductsPage() {
  const access = useShellAccess();
  const isAdmin = access.identity?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SelectOption>(CATEGORY_OPTIONS[0]);
  const [brand, setBrand] = useState<SelectOption>({ value: "all", label: "All Brands" });
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);
  const [stockStatus, setStockStatus] = useState<SelectOption>(STOCK_STATUS_OPTIONS[0]);

  const [appliedItemCode, setAppliedItemCode] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("all");
  const [appliedBrand, setAppliedBrand] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");
  const [appliedStockStatus, setAppliedStockStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(
    null,
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT_FORM);
  const [formError, setFormError] = useState("");

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: [
      "products-master-list",
      {
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        brand: appliedBrand,
        status: appliedStatus,
        stockStatus: appliedStockStatus,
      },
    ],
    queryFn: () =>
      fetchProducts({
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        brand: appliedBrand,
        status: appliedStatus,
        stockStatus: appliedStockStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const brandOptions = useMemo(() => {
    const values = [...new Set(rows.map((product) => product.brand).filter(Boolean))].sort();
    return [{ value: "all", label: "All Brands" }, ...values.map((value) => ({ value, label: value }))];
  }, [rows]);
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        itemCode: form.itemCode,
        name: form.name,
        category: form.category || undefined,
        brand: form.brand || undefined,
        description: form.description || undefined,
        price: form.price ? Number(form.price) : null,
        reorderLevel: Number(form.reorderLevel || 0),
        status: form.status,
      };
      return selectedProduct
        ? productRequest(`/api/products/${selectedProduct.id}`, "PATCH", payload)
        : productRequest("/api/products", "POST", payload);
    },
    onSuccess: () => {
      setIsEditOpen(false);
      setSelectedProduct(null);
      setForm(EMPTY_PRODUCT_FORM);
      setFormError("");
      queryClient.invalidateQueries({ queryKey: ["products-master-list"] });
    },
    onError: (error: Error) => setFormError(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (productId: string) => productRequest(`/api/products/${productId}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products-master-list"] }),
    onError: (error: Error) => setFormError(error.message),
  });
  const meta = useMemo(() => data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  }, [data?.meta, pageSize]);
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
    setAppliedBrand(brand.value);
    setAppliedStatus(status.value);
    setAppliedStockStatus(stockStatus.value);
  };

  const handleResetFilters = () => {
    setItemCode("");
    setName("");
    setCategory(CATEGORY_OPTIONS[0]);
    setBrand({ value: "all", label: "All Brands" });
    setStatus(STATUS_OPTIONS[0]);
    setStockStatus(STOCK_STATUS_OPTIONS[0]);

    setAppliedItemCode("");
    setAppliedName("");
    setAppliedCategory("all");
    setAppliedBrand("all");
    setAppliedStatus("all");
    setAppliedStockStatus("all");
    setPage(1);
  };

  const openProductDialog = (product?: ProductRow) => {
    setSelectedProduct(product ?? null);
    setForm(product
      ? {
        itemCode: product.itemCode,
        name: product.name,
        category: product.category === "Uncategorized" ? "" : product.category,
        brand: product.brand === "Unbranded" ? "" : product.brand,
        description: product.description ?? "",
        price: product.price?.toString() ?? "",
        reorderLevel: String(product.reorderLevel),
        status: product.status === "Active" ? "ACTIVE" : "INACTIVE",
      }
      : EMPTY_PRODUCT_FORM);
    setFormError("");
    setIsEditOpen(true);
  };

  const submitProduct = () => {
    if (!isAdmin) return;
    setFormError("");
    saveMutation.mutate();
  };

  return (
    <>
      <PageShell
        title="Products"
        subtitle="Manage product master data. Admin controls product edits while Stock Staff keeps read-only catalog visibility."
        actions={
          isAdmin ? (
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => openProductDialog()}
            >
              Add Product
            </Button>
          ) : null
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
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
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

            <div className="w-full">
              <Select
                instanceId="products-brand-filter"
                options={brandOptions}
                value={brand}
                onChange={(option) => setBrand(option ?? brandOptions[0])}
                isSearchable
                placeholder="Select brand"
                styles={reactSelectStyles}
              />
            </div>

            <div className="w-full">
              <Select
                instanceId="products-stock-status-filter"
                options={STOCK_STATUS_OPTIONS}
                value={stockStatus}
                onChange={(option) => setStockStatus(option ?? STOCK_STATUS_OPTIONS[0])}
                isSearchable
                placeholder="Stock status"
                styles={reactSelectStyles}
              />
            </div>

            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-6 xl:justify-end">
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleApplyFilters}
              >
                Apply Filters
              </Button>

              <Button
                variant="outline"
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
              <table className={`w-full ${isAdmin ? "min-w-[1150px]" : "min-w-[1020px]"}`}>
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
                      Brand
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
                    {isAdmin && <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>}
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={isAdmin ? 9 : 8} className="px-5 py-16 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading products...
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 9 : 8}
                        className="px-5 py-16 text-center text-red-600"
                      >
                        {error.message}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={isAdmin ? 9 : 8}
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
                        <td className="px-5 py-4 text-sm text-slate-600">
                          {product.brand}
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
                        {isAdmin && <td className="px-5 py-4">
                          <div className="flex flex-row gap-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                onClick={() => openProductDialog(product)}
                              >
                                Edit
                              </Button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                                disabled={!product.canDelete || deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(product.id)}
                                title={product.canDelete ? "Delete unused product" : "Products with balances or history cannot be deleted"}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        </td>}
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
                  value={form.itemCode}
                  disabled={Boolean(selectedProduct && !selectedProduct.canEditItemCode)}
                  onChange={(event) => setForm((current) => ({ ...current, itemCode: event.target.value }))}
                  placeholder="ITM-0013"
                />
                {selectedProduct && !selectedProduct.canEditItemCode && (
                  <p className="text-xs text-slate-500">Item code is locked because this product already has balances or history.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="productName">Product Name</Label>
                <Input
                  id="productName"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Product name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="Tint"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={form.brand}
                  onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                  placeholder="Brand"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reorderLevel">Reorder Level</Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  min="0"
                  step="1"
                  value={form.reorderLevel}
                  onChange={(event) => setForm((current) => ({ ...current, reorderLevel: event.target.value }))}
                />
                <p className="text-xs text-slate-500">Applied to this product across Stock Room and branches.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProductForm["status"] }))}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Product description"
                />
              </div>
            </div>

            {form.status === "INACTIVE" && selectedProduct?.hasStock && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                This product has stock or reservations. It will remain visible in inventory/history but cannot be selected for new workflows after deactivation.
              </div>
            )}

            {formError && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {!selectedProduct && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                After creating this product, use the Inventory module to receive
                opening stock into Stock Room through the Inventory module.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>

            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={saveMutation.isPending}
              onClick={submitProduct}
            >
              {selectedProduct ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
