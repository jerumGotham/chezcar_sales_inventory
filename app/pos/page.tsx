"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";
import Link from "next/link";
import type { StylesConfig } from "react-select";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  ClipboardList,
  Wrench,
  PackageCheck,
  UserRound,
  Package2,
  Car,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageShell } from "@/components/page-shell";
import { useShellAccess } from "@/components/shell-access-context";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { products } from "@/lib/mock-data";
import { fetchProducts } from "@/lib/catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Product = {
  id?: string | number;
  sku: string;
  name: string;
  category?: string;
  price: number | string;
  stock?: number;
  image?: string;
  barcode?: string;
};

type CartItem = {
  productId: string;
  sku: string;
  name: string;
  category?: string;
  price: number;
  qty: number;
};

type SelectOption = {
  value: string;
  label: string;
};

type PosCustomer = { id: string; name: string };

type OrderItemRow = {
  item: SelectOption | null;
  quantity: number;
  unitPrice: number;
};

type CustomerFormState = {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  address: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  plateNumber: string;
  branch: string;
  source: string;
  customerNotes: string;
};

const mockCustomers: SelectOption[] = [
  { value: "guest", label: "Guest" },
  { value: "cust-1", label: "Juan Dela Cruz" },
  { value: "cust-2", label: "Maria Santos" },
  { value: "cust-3", label: "Ana Reyes" },
  { value: "cust-4", label: "Mark Bautista" },
];

const paymentOptions: SelectOption[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "split", label: "Split Payment" },
];

const ORDER_STATUS_OPTIONS: SelectOption[] = [
  { value: "Reserved", label: "Reserved" },
  { value: "Pending", label: "Pending" },
  { value: "For Release", label: "For Release" },
];

const ORDER_PAYMENT_OPTIONS: SelectOption[] = [
  { value: "Unpaid", label: "Unpaid" },
  { value: "Partial", label: "Partial" },
  { value: "Paid", label: "Paid" },
];

const JOB_BRANCH_OPTIONS: SelectOption[] = [
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const JOB_STATUS_OPTIONS: SelectOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready-for-release", label: "Ready for Release" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function parsePrice(value: number | string) {
  if (typeof value === "number") return value;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isNaN(numeric) ? 0 : numeric;
}

function formatPeso(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

async function fetchPosCustomers() {
  const response = await fetch("/api/customers?page=1&pageSize=100&status=active", { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load customers");
  return json.data as { data: PosCustomer[] };
}

const selectStyles: StylesConfig<SelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 44,
    borderRadius: 12,
    borderColor: state.isFocused ? "#16a34a" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#16a34a",
    },
  }),
  menu: (base) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 50,
  }),
  valueContainer: (base) => ({
    ...base,
    paddingLeft: 12,
    paddingRight: 12,
  }),
  placeholder: (base) => ({
    ...base,
    color: "#94a3b8",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#16a34a"
      : state.isFocused
        ? "#f1f5f9"
        : "white",
    color: state.isSelected ? "white" : "#0f172a",
    cursor: "pointer",
  }),
};

const EMPTY_CUSTOMER_FORM: CustomerFormState = {
  firstName: "",
  lastName: "",
  mobile: "",
  email: "",
  address: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleYear: "",
  plateNumber: "",
  branch: "",
  source: "",
  customerNotes: "",
};

function AddCustomerDialog({
  open,
  onOpenChange,
  customerForm,
  onCustomerFormChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerForm: CustomerFormState;
  onCustomerFormChange: (key: keyof CustomerFormState, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
          <DialogDescription>
            Save customer profile details and one primary vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={customerForm.firstName}
                onChange={(e) =>
                  onCustomerFormChange("firstName", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={customerForm.lastName}
                onChange={(e) =>
                  onCustomerFormChange("lastName", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                value={customerForm.mobile}
                onChange={(e) => onCustomerFormChange("mobile", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={customerForm.email}
                onChange={(e) => onCustomerFormChange("email", e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="Street, barangay, city"
                value={customerForm.address}
                onChange={(e) =>
                  onCustomerFormChange("address", e.target.value)
                }
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Vehicle Information
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vehicleMake">Vehicle Make</Label>
                <Input
                  id="vehicleMake"
                  placeholder="Toyota"
                  value={customerForm.vehicleMake}
                  onChange={(e) =>
                    onCustomerFormChange("vehicleMake", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleModel">Vehicle Model</Label>
                <Input
                  id="vehicleModel"
                  placeholder="Rush"
                  value={customerForm.vehicleModel}
                  onChange={(e) =>
                    onCustomerFormChange("vehicleModel", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicleYear">Year</Label>
                <Input
                  id="vehicleYear"
                  placeholder="2022"
                  value={customerForm.vehicleYear}
                  onChange={(e) =>
                    onCustomerFormChange("vehicleYear", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plateNumber">Plate Number</Label>
                <Input
                  id="plateNumber"
                  placeholder="ABC-1234"
                  value={customerForm.plateNumber}
                  onChange={(e) =>
                    onCustomerFormChange("plateNumber", e.target.value)
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Business Notes
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch">Preferred Branch</Label>
                <Input
                  id="branch"
                  value={customerForm.branch}
                  onChange={(e) =>
                    onCustomerFormChange("branch", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source / Referred By</Label>
                <Input
                  id="source"
                  placeholder="Walk-in / Facebook / Referral"
                  value={customerForm.source}
                  onChange={(e) =>
                    onCustomerFormChange("source", e.target.value)
                  }
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="customerNotes">Notes</Label>
                <Input
                  id="customerNotes"
                  placeholder="Customer preferences, reminders, tint shade request, etc."
                  value={customerForm.customerNotes}
                  onChange={(e) =>
                    onCustomerFormChange("customerNotes", e.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onSubmit}
          >
            Create Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PosTab() {
  const access = useShellAccess();
  const role = access.authenticated ? access.identity.role : null;
  const [selectedLocation, setSelectedLocation] = useState<SelectOption | null>(null);
  const activeLocationId = role === "ADMIN" ? selectedLocation?.value ?? null : access.authenticated ? access.scope.locationId : null;
  const posOptionsQuery = useQuery({
    queryKey: ["pos-options", activeLocationId],
    queryFn: async () => {
      const response = await fetch(`/api/customer-orders/options?locationId=${encodeURIComponent(activeLocationId ?? "")}`, { credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to load sales options");
      return json.data as { customers: PosCustomer[]; products: Array<{ id: string; itemCode: string; name: string; price: number; availableQuantity: number }>; branches: Array<{ id: string; code: string; name: string }> };
    },
    enabled: role === "ADMIN" || Boolean(activeLocationId),
  });
  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ["pos-products"],
    queryFn: () =>
      fetchProducts({
        page: 1,
        pageSize: 100,
        status: "Active",
        stockStatus: "has-stock",
        itemCode: "",
        name: "",
        category: "all",
        brand: "all",
      }),
  });
  const customersQuery = useQuery({ queryKey: ["pos-customers"], queryFn: fetchPosCustomers });

  const productList = useMemo<Product[]>(() => {
    const branchProducts = posOptionsQuery.data?.products.map((item) => ({
      id: item.id,
      sku: item.itemCode,
      name: item.name,
      price: item.price,
      stock: item.availableQuantity,
      barcode: item.itemCode,
      category: "Uncategorized",
    })) ?? [];

    if (posOptionsQuery.data) return branchProducts;
    if (role === "ADMIN" || activeLocationId) return [];

    const persisted = productsData?.data.map((item) => ({
      id: item.id,
      sku: item.itemCode,
      name: item.name,
      price: item.price ?? 0,
      stock: item.hasStock ? 1 : 0,
      barcode: item.itemCode,
      category: item.category,
    })) ?? [];

    if (persisted.length > 0) return persisted;

    return products.map((item) => ({
      id: String(item.sku),
      sku: item.sku,
      name: item.name,
      price: parsePrice(item.price),
      stock: item.stock ?? 20,
      barcode: item.sku,
      category: item.category ?? "Uncategorized",
    }));
  }, [activeLocationId, posOptionsQuery.data, productsData?.data, role]);

  const categoryOptions = useMemo<SelectOption[]>(() => {
    const uniqueCategories = Array.from(
      new Set(productList.map((item) => item.category || "Uncategorized")),
    ).sort();

    return [
      { value: "all", label: "All Categories" },
      ...uniqueCategories.map((category) => ({
        value: category,
        label: category,
      })),
    ];
  }, [productList]);

  const [search, setSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const productPageSize = 10;
  const [selectedCategory, setSelectedCategory] = useState<SelectOption | null>(
    categoryOptions[0],
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectOption | null>(
    mockCustomers[0],
  );
  const [paymentType, setPaymentType] = useState<SelectOption | null>(null);
  const [manualReceiptNumber, setManualReceiptNumber] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);

  const customerOptions: SelectOption[] = [
    { value: "guest", label: "Guest" },
    ...(customersQuery.data?.data.map((customer) => ({ value: customer.id, label: customer.name })) ?? []),
  ];

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const category = selectedCategory?.value ?? "all";

    return productList.filter((product) => {
      const matchesCategory =
        category === "all" || product.category === category;

      const matchesKeyword =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.sku.toLowerCase().includes(keyword) ||
        String(product.barcode).toLowerCase().includes(keyword) ||
        (product.category ?? "").toLowerCase().includes(keyword);

      return matchesCategory && matchesKeyword;
    });
  }, [productList, search, selectedCategory]);

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
  const safeProductPage = Math.min(productPage, productTotalPages);
  const paginatedProducts = filteredProducts.slice(
    (safeProductPage - 1) * productPageSize,
    safeProductPage * productPageSize,
  );

  const quickProducts = useMemo(() => productList.slice(0, 8), [productList]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const [discountAmount, setDiscountAmount] = useState("0");
  const discount = Math.max(0, Number(discountAmount) || 0);
  const total = Math.max(subtotal - discount, 0);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.sku === product.sku);

      if (existing) {
        if (existing.qty >= (product.stock ?? 0)) return prev;
        return prev.map((item) =>
          item.sku === product.sku ? { ...item, qty: item.qty + 1 } : item,
        );
      }

      return [
        ...prev,
        {
          sku: product.sku,
          productId: String(product.id ?? product.sku),
          name: product.name,
          category: product.category,
          price: Number(product.price),
          qty: 1,
        },
      ];
    });
  };

  const updateQty = (sku: string, type: "increase" | "decrease") => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.sku !== sku) return item;
           const product = productList.find((candidate) => candidate.sku === sku);
           const nextQty = type === "increase"
             ? Math.min(item.qty + 1, product?.stock ?? item.qty + 1)
             : item.qty - 1;
          return { ...item, qty: nextQty };
        })
        .filter((item) => item.qty > 0),
    );
  };

  const removeItem = (sku: string) => {
    setCart((prev) => prev.filter((item) => item.sku !== sku));
  };

  const clearSale = () => {
    setCart([]);
    setSelectedCustomer(
      customerOptions.find((c) => c.value === "guest") ?? null,
    );
    setPaymentType(null);
    setManualReceiptNumber("");
    setDiscountAmount("0");
    setCheckoutError("");
    setSearch("");
    setSelectedCategory(categoryOptions[0]);
  };

  const handleCheckout = async () => {
    setCheckoutError("");
    setSuccessMessage("");
    setIsCheckoutPending(true);
    const paymentMap: Record<string, string> = {
      cash: "CASH",
      gcash: "GCASH",
      maya: "MAYA",
      bank_transfer: "BANK_TRANSFER",
      credit_card: "CREDIT_CARD",
      split: "SPLIT",
    };

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
           customerId:
            selectedCustomer?.value && selectedCustomer.value !== "guest"
              ? selectedCustomer.value
               : undefined,
           locationId: activeLocationId,
           manualReceiptNumber,
          paymentMethod: paymentMap[paymentType?.value ?? "cash"] ?? "CASH",
           amountPaid: total,
           discountAmount: discount,
          lines: cart.map((item) => ({
            productId: item.productId,
            quantity: item.qty,
            unitPrice: item.price,
          })),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? "Unable to complete sale");
      }
      clearSale();
      setSuccessMessage("Customer sale posted successfully.");
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Unable to complete sale");
    } finally {
      setIsCheckoutPending(false);
    }
  };

  return (
    <>
      {successMessage ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-sm font-medium">{successMessage}</p>
          <div className="flex items-center gap-2">
            <Link href="/customer-orders?view=sales">
              <Button size="sm" variant="outline" className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100">
                View Customer Orders
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={() => setSuccessMessage("")}>Dismiss</Button>
          </div>
        </div>
      ) : null}
      <Card className="mb-6 border-emerald-100 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-slate-900">Selling branch</p>
            <p className="text-sm text-slate-500">Products and stock are limited to this branch.</p>
          </div>
          {role === "ADMIN" ? (
            <Select
              instanceId="pos-location"
              className="min-w-64"
              options={posOptionsQuery.data?.branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` })) ?? []}
              value={selectedLocation}
              onChange={(option) => {
                setSelectedLocation(option);
                setCart([]);
                setProductPage(1);
              }}
              isSearchable={false}
              placeholder="Select branch"
              styles={selectStyles}
            />
          ) : (
            <Badge className="w-fit bg-emerald-100 text-emerald-700">{access.authenticated ? access.scope.label : "No branch"}</Badge>
          )}
        </CardContent>
      </Card>
      {role === "ADMIN" && !activeLocationId ? <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Select a branch to load available products.</p> : null}
      {posOptionsQuery.isError ? <p className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(posOptionsQuery.error as Error).message}</p> : null}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle>Quick Add</CardTitle>
              <CardDescription>
                Fast-moving products for quicker cashier transactions.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {quickProducts.map((product) => (
                  <button
                    key={`quick-${product.sku}`}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="rounded-2xl border bg-white p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {product.sku}
                        </p>
                      </div>
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {product.stock}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-600">
                        {formatPeso(Number(product.price))}
                      </span>
                      <span className="text-xs text-slate-500">Tap to add</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle>Product Search</CardTitle>
              <CardDescription>
                Use Item Code, product name, or category to find items fast.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setProductPage(1);
                    }}
                    placeholder="Search product"
                    className="pl-9"
                  />
                </div>

                <Select
                  instanceId="category-select"
                  options={categoryOptions}
                  value={selectedCategory}
                   onChange={(option) => {
                     setSelectedCategory(option);
                     setProductPage(1);
                   }}
                  isSearchable
                  placeholder="Filter category"
                  styles={selectStyles}
                />
              </div>

              <div className="rounded-2xl border bg-white">
                <div className="grid grid-cols-[1.8fr_1fr_110px_130px_120px] gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div>Product</div>
                  <div>Category</div>
                  <div>Stock</div>
                  <div>Price</div>
                  <div className="text-right">Action</div>
                </div>

                <div className="max-h-[560px] overflow-y-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">
                      No products found.
                    </div>
                  ) : (
                    paginatedProducts.map((product) => (
                      <div
                        key={product.sku}
                        className="grid grid-cols-[1.8fr_1fr_110px_130px_120px] items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Item Code: {product.sku}
                          </p>
                        </div>

                        <div className="truncate text-sm text-slate-600">
                          {product.category}
                        </div>

                        <div>
                          <Badge variant="secondary">
                            Stock {product.stock}
                          </Badge>
                        </div>

                        <div className="text-sm font-semibold text-emerald-600">
                          {formatPeso(Number(product.price))}
                        </div>

                        <div className="text-right">
                          <Button
                            size="sm"
                            onClick={() => addToCart(product)}
                            className="min-w-[92px]"
                          >
                            <Plus className="mr-2 size-4" />
                            Add
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

               <div className="flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                 <p>
                   Showing {filteredProducts.length === 0 ? 0 : (safeProductPage - 1) * productPageSize + 1}-{Math.min(safeProductPage * productPageSize, filteredProducts.length)} of {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}.
                 </p>
                 <div className="flex items-center gap-2">
                   <Button variant="outline" size="sm" onClick={() => setProductPage((page) => Math.max(1, page - 1))} disabled={safeProductPage <= 1}>
                     <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                   </Button>
                   <span>Page {safeProductPage} of {productTotalPages}</span>
                   <Button variant="outline" size="sm" onClick={() => setProductPage((page) => Math.min(productTotalPages, page + 1))} disabled={safeProductPage >= productTotalPages}>
                     Next <ChevronRight className="ml-1 h-4 w-4" />
                   </Button>
                 </div>
               </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit border-0 shadow-sm xl:sticky xl:top-6">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              Current Sale
            </CardTitle>
            <CardDescription>
              Review items, assign customer, and complete payment.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Label>Customer</Label>

              <Select
                instanceId="customer-select"
                options={customerOptions}
                value={selectedCustomer}
                onChange={(option) => setSelectedCustomer(option)}
                isSearchable
                placeholder="Search customer..."
                styles={selectStyles}
              />
            </div>

            <div className="space-y-3">
              <Label>Payment Type</Label>
              <Select
                instanceId="payment-type-select"
                options={paymentOptions}
                value={paymentType}
                onChange={(option) => setPaymentType(option)}
                isSearchable
                placeholder="Select payment type"
                styles={selectStyles}
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="manual-receipt-number">Manual Receipt Number</Label>
              <Input
                id="manual-receipt-number"
                value={manualReceiptNumber}
                onChange={(event) => setManualReceiptNumber(event.target.value)}
                placeholder="Official handwritten receipt number"
              />
            </div>

            <Separator />

            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {isProductsLoading ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                  Loading products...
                </div>
              ) : cart.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">
                  No items yet. Add products from the left panel.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.sku} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-sm text-slate-500">{item.sku}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatPeso(item.price)} each
                        </p>
                      </div>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(item.sku)}
                      >
                        <Trash2 className="size-4 text-rose-500" />
                      </Button>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => updateQty(item.sku, "decrease")}
                        >
                          <Minus className="size-4" />
                        </Button>

                        <div className="flex h-10 min-w-12 items-center justify-center rounded-md border px-3 text-sm font-medium">
                          {item.qty}
                        </div>

                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => updateQty(item.sku, "increase")}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>

                      <p className="font-semibold text-slate-900">
                        {formatPeso(item.qty * item.price)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="sale-discount">Discount</Label>
              <Input
                id="sale-discount"
                type="number"
                min="0"
                max={subtotal}
                step="0.01"
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-slate-500">Discount cannot exceed the sale subtotal of {formatPeso(subtotal)}.</p>
            </div>

            <div className="rounded-2xl border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium">{formatPeso(subtotal)}</span>
              </div>

              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">Discount</span>
                <span className="font-medium">{formatPeso(discount)}</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t pt-3 text-base font-semibold">
                <span>Total</span>
                <span className="text-emerald-600">{formatPeso(total)}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {checkoutError && (
                <p className="text-sm font-medium text-red-600 sm:col-span-2">
                  {checkoutError}
                </p>
              )}
              <Button variant="outline" onClick={clearSale}>
                Reset
              </Button>
              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                 disabled={!activeLocationId || !cart.length || !paymentType || !manualReceiptNumber.trim() || discount > subtotal || isCheckoutPending}
              >
                <CreditCard className="mr-2 size-4" />
                {isCheckoutPending ? "Posting Sale..." : "Complete Sale"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

    </>
  );
}

function CustomerOrderTab() {
  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [status, setStatus] = useState<SelectOption>(ORDER_STATUS_OPTIONS[0]);
  const [paymentStatus, setPaymentStatus] = useState<SelectOption>(
    ORDER_PAYMENT_OPTIONS[0],
  );
  const [downpayment, setDownpayment] = useState("0");
  const [releaseDate, setReleaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemRow[]>([
    {
      item: null,
      quantity: 1,
      unitPrice: 0,
    },
  ]);

  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<SelectOption[]>(
    mockCustomers.filter((c) => c.value !== "guest"),
  );

  const [customerForm, setCustomerForm] =
    useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);

  const resetCustomerForm = () => {
    setCustomerForm(EMPTY_CUSTOMER_FORM);
  };

  const handleCustomerFormChange = (
    key: keyof CustomerFormState,
    value: string,
  ) => {
    setCustomerForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCreateCustomer = () => {
    const fullName =
      `${customerForm.firstName} ${customerForm.lastName}`.trim();

    if (!fullName) return;

    const newCustomerOption: SelectOption = {
      value: `${fullName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      label: fullName,
    };

    setCustomerOptions((prev) => [newCustomerOption, ...prev]);
    setCustomer(newCustomerOption);

    console.log("CREATE CUSTOMER PAYLOAD - CUSTOMER ORDER", {
      ...customerForm,
      fullName,
    });

    setIsAddCustomerOpen(false);
    resetCustomerForm();
  };

  const itemOptions = useMemo<SelectOption[]>(() => {
    return (products as Product[]).map((item) => ({
      value: item.name,
      label: item.name,
    }));
  }, []);

  const itemPriceMap = useMemo<Record<string, number>>(() => {
    return (products as Product[]).reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.name] = parsePrice(item.price);
        return acc;
      },
      {},
    );
  }, []);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        item: null,
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeItem = (index: number, option: SelectOption | null) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              item: option,
              unitPrice: option ? (itemPriceMap[option.value] ?? 0) : 0,
            }
          : row,
      ),
    );
  };

  const handleChangeQuantity = (index: number, value: number) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              quantity: Number.isNaN(value) ? 1 : Math.max(1, value),
            }
          : row,
      ),
    );
  };

  const subtotal = useMemo(() => {
    return items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
  }, [items]);

  const parsedDownpayment = Number(downpayment || 0);
  const balance = Math.max(subtotal - parsedDownpayment, 0);

  const handleSaveOrder = () => {
    const payload = {
      customerId: customer?.value ?? null,
      customerName: customer?.label ?? null,
      status: status.value,
      paymentStatus: paymentStatus.value,
      releaseDate,
      notes,
      downpayment: parsedDownpayment,
      subtotal,
      balance,
      items: items.map((row) => ({
        productName: row.item?.value ?? null,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        amount: row.quantity * row.unitPrice,
      })),
    };

    console.log("CUSTOMER ORDER PAYLOAD", payload);
  };

  const handleClear = () => {
    setCustomer(null);
    setStatus(ORDER_STATUS_OPTIONS[0]);
    setPaymentStatus(ORDER_PAYMENT_OPTIONS[0]);
    setDownpayment("0");
    setReleaseDate("");
    setNotes("");
    setItems([
      {
        item: null,
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <UserRound className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-foreground">
                  Customer Information
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Customer</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        resetCustomerForm();
                        setIsAddCustomerOpen(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Customer
                    </Button>
                  </div>

                  <Select
                    instanceId="create-order-customer"
                    options={customerOptions}
                    value={customer}
                    onChange={(option) => setCustomer(option)}
                    isSearchable
                    placeholder="Select customer"
                    styles={selectStyles}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Release Date</Label>
                  <Input
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Order Status</Label>
                  <Select
                    instanceId="create-order-status"
                    options={ORDER_STATUS_OPTIONS}
                    value={status}
                    onChange={(option) =>
                      setStatus(option ?? ORDER_STATUS_OPTIONS[0])
                    }
                    isSearchable
                    styles={selectStyles}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <Select
                    instanceId="create-order-payment-status"
                    options={ORDER_PAYMENT_OPTIONS}
                    value={paymentStatus}
                    onChange={(option) =>
                      setPaymentStatus(option ?? ORDER_PAYMENT_OPTIONS[0])
                    }
                    isSearchable
                    styles={selectStyles}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes or customer request"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package2 className="h-5 w-5 text-emerald-600" />
                  <h3 className="text-base font-semibold text-foreground">
                    Order Items
                  </h3>
                </div>

                <Button variant="outline" onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {items.map((row, index) => {
                  const amount = row.quantity * row.unitPrice;

                  return (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <Badge variant="outline">Item #{index + 1}</Badge>

                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Product</Label>
                          <Select
                            instanceId={`create-order-item-${index}`}
                            options={itemOptions}
                            value={row.item}
                            onChange={(option) =>
                              handleChangeItem(index, option)
                            }
                            isSearchable
                            placeholder="Select product"
                            styles={selectStyles}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) =>
                              handleChangeQuantity(
                                index,
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Unit Price</Label>
                          <Input value={row.unitPrice} readOnly />
                        </div>
                      </div>

                      <div className="mt-3 text-right text-sm text-slate-600">
                        Amount:{" "}
                        <span className="font-semibold text-foreground">
                          {formatPeso(amount)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-foreground">
                Order Summary
              </h3>

              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Total Items</span>
                  <span className="font-medium text-foreground">
                    {items.reduce((sum, row) => sum + row.quantity, 0)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium text-foreground">
                    {formatPeso(subtotal)}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label>Downpayment</Label>
                  <Input
                    type="number"
                    min={0}
                    value={downpayment}
                    onChange={(e) => setDownpayment(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between border-t pt-4 text-base font-semibold">
                  <span>Balance</span>
                  <span>{formatPeso(balance)}</span>
                </div>

                <div className="grid gap-3">
                  <Button
                    className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={handleSaveOrder}
                  >
                    Save Order
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleClear}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddCustomerDialog
        open={isAddCustomerOpen}
        onOpenChange={(open) => {
          setIsAddCustomerOpen(open);
          if (!open) resetCustomerForm();
        }}
        customerForm={customerForm}
        onCustomerFormChange={handleCustomerFormChange}
        onSubmit={handleCreateCustomer}
      />
    </>
  );
}

function JobOrderTab() {
  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [customerOptions, setCustomerOptions] = useState<SelectOption[]>(
    mockCustomers.filter((c) => c.value !== "guest"),
  );
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [customerForm, setCustomerForm] =
    useState<CustomerFormState>(EMPTY_CUSTOMER_FORM);

  const [vehicle, setVehicle] = useState("");
  const [jobBranch, setJobBranch] = useState<SelectOption>(
    JOB_BRANCH_OPTIONS[0],
  );
  const [jobStatus, setJobStatus] = useState<SelectOption>(
    JOB_STATUS_OPTIONS[0],
  );
  const [service, setService] = useState("");
  const [serviceFee, setServiceFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemRow[]>([]);

  const productOptions = useMemo<SelectOption[]>(
    () =>
      (products as Product[]).map((item, index) => ({
        value: String(item.id ?? item.sku ?? index),
        label: item.name,
      })),
    [],
  );

  const productPriceMap = useMemo<Record<string, number>>(
    () =>
      (products as Product[]).reduce(
        (acc, item, index) => {
          const key = String(item.id ?? item.sku ?? index);
          acc[key] = parsePrice(item.price);
          return acc;
        },
        {} as Record<string, number>,
      ),
    [],
  );

  const resetCustomerForm = () => {
    setCustomerForm(EMPTY_CUSTOMER_FORM);
  };

  const handleCustomerFormChange = (
    key: keyof CustomerFormState,
    value: string,
  ) => {
    setCustomerForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleCreateCustomer = () => {
    const fullName =
      `${customerForm.firstName} ${customerForm.lastName}`.trim();

    if (!fullName) return;

    const newCustomerOption: SelectOption = {
      value: `${fullName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      label: fullName,
    };

    setCustomerOptions((prev) => [newCustomerOption, ...prev]);
    setCustomer(newCustomerOption);

    const vehicleText = [
      customerForm.vehicleMake,
      customerForm.vehicleModel,
      customerForm.vehicleYear,
      customerForm.plateNumber,
    ]
      .filter(Boolean)
      .join(" / ");

    if (vehicleText && !vehicle) {
      setVehicle(vehicleText);
    }

    console.log("CREATE CUSTOMER PAYLOAD - JOB ORDER", {
      ...customerForm,
      fullName,
    });

    setIsAddCustomerOpen(false);
    resetCustomerForm();
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        item: null,
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChangeItem = (index: number, option: SelectOption | null) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              item: option,
              unitPrice: option ? (productPriceMap[option.value] ?? 0) : 0,
            }
          : row,
      ),
    );
  };

  const handleChangeQuantity = (index: number, value: number) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              quantity: Number.isNaN(value) ? 1 : Math.max(1, value),
            }
          : row,
      ),
    );
  };

  const partsTotal = useMemo(
    () => items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
    [items],
  );

  const parsedServiceFee = Number(serviceFee || 0);
  const totalAmount = partsTotal + parsedServiceFee;

  const handleClear = () => {
    setCustomer(null);
    setVehicle("");
    setJobBranch(JOB_BRANCH_OPTIONS[0]);
    setJobStatus(JOB_STATUS_OPTIONS[0]);
    setService("");
    setServiceFee("0");
    setNotes("");
    setItems([]);
  };

  const handleSave = () => {
    const payload = {
      customerId: customer?.value ?? null,
      customerName: customer?.label ?? null,
      vehicle,
      branch: jobBranch.label,
      status: jobStatus.label,
      service,
      serviceFee: parsedServiceFee,
      partsTotal,
      totalAmount,
      notes,
      items: items.map((row) => ({
        productId: row.item?.value ?? null,
        productName: row.item?.label ?? null,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        amount: row.quantity * row.unitPrice,
      })),
    };

    console.log("CREATE JOB ORDER PAYLOAD", payload);
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-5 text-emerald-600" />
                Create Job Order
              </CardTitle>
              <CardDescription>
                Create a service or installation transaction with optional parts
                and materials.
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Customer</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      resetCustomerForm();
                      setIsAddCustomerOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Customer
                  </Button>
                </div>

                <Select
                  instanceId="create-job-order-customer"
                  options={customerOptions}
                  value={customer}
                  onChange={(option) => setCustomer(option)}
                  isSearchable
                  placeholder="Select customer"
                  styles={selectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Vehicle / Unit</Label>
                <Input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="Toyota Rush 2022 / ABC-1234"
                />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  instanceId="create-job-order-branch"
                  options={JOB_BRANCH_OPTIONS}
                  value={jobBranch}
                  onChange={(option) =>
                    setJobBranch(option ?? JOB_BRANCH_OPTIONS[0])
                  }
                  isSearchable
                  styles={selectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  instanceId="create-job-order-status"
                  options={JOB_STATUS_OPTIONS}
                  value={jobStatus}
                  onChange={(option) =>
                    setJobStatus(option ?? JOB_STATUS_OPTIONS[0])
                  }
                  isSearchable
                  styles={selectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Service Fee</Label>
                <Input
                  type="number"
                  min={0}
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Service Details</Label>
                <Textarea
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="Describe the requested service in detail..."
                  className="min-h-[140px]"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional reminders, customer instructions, follow-up notes, etc."
                  className="min-h-[120px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package2 className="h-5 w-5 text-emerald-600" />
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      Items / Parts
                    </h3>
                    <p className="text-sm text-slate-500">
                      Optional. Leave empty for service-only transactions.
                    </p>
                  </div>
                </div>

                <Button variant="outline" type="button" onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No items added yet.
                  </div>
                ) : (
                  items.map((row, index) => {
                    const amount = row.quantity * row.unitPrice;

                    return (
                      <div
                        key={index}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <Badge variant="outline">Item #{index + 1}</Badge>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="space-y-2 md:col-span-2">
                            <Label>Product</Label>
                            <Select
                              instanceId={`create-job-order-item-${index}`}
                              options={productOptions}
                              value={row.item}
                              onChange={(option) =>
                                handleChangeItem(index, option)
                              }
                              isSearchable
                              placeholder="Select product"
                              styles={selectStyles}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input
                              type="number"
                              min={1}
                              value={row.quantity}
                              onChange={(e) =>
                                handleChangeQuantity(
                                  index,
                                  Number(e.target.value),
                                )
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Unit Price</Label>
                            <Input value={row.unitPrice} readOnly />
                          </div>
                        </div>

                        <div className="mt-3 text-right text-sm text-slate-600">
                          Amount:{" "}
                          <span className="font-semibold text-foreground">
                            {formatPeso(amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardContent className="space-y-4 p-5">
              <h3 className="text-base font-semibold text-foreground">
                Job Order Summary
              </h3>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <Car className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-500">Vehicle / Unit</p>
                    <p className="truncate font-medium text-foreground">
                      {vehicle || "Not yet specified"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-500">Service</p>
                    <p className="line-clamp-3 text-sm font-medium text-foreground">
                      {service || "No service details yet"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Items Count</span>
                <span className="font-medium text-foreground">
                  {items.reduce((sum, row) => sum + row.quantity, 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Service Fee</span>
                <span className="font-medium text-foreground">
                  {formatPeso(parsedServiceFee)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Parts Total</span>
                <span className="font-medium text-foreground">
                  {formatPeso(partsTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t pt-4 text-base font-semibold">
                <span>Total Amount</span>
                <span>{formatPeso(totalAmount)}</span>
              </div>

              <div className="grid gap-3">
                <Button
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleSave}
                >
                  Save Job Order
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleClear}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AddCustomerDialog
        open={isAddCustomerOpen}
        onOpenChange={(open) => {
          setIsAddCustomerOpen(open);
          if (!open) resetCustomerForm();
        }}
        customerForm={customerForm}
        onCustomerFormChange={handleCustomerFormChange}
        onSubmit={handleCreateCustomer}
      />
    </>
  );
}

export default function SalesPage() {
  return (
    <PageShell
      title="Customer Sales"
      subtitle="Post walk-in sales for the selected branch and customer."
      actions={
        <Link href="/customer-orders">
          <Button variant="outline">Customer Orders</Button>
        </Link>
      }
    >
      <PosTab />
    </PageShell>
  );
}
