"use client";

import { useMemo, useState } from "react";
import Select from "react-select";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  ScanLine,
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
import { products } from "@/lib/mock-data";

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

const selectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    minHeight: 44,
    borderRadius: 12,
    borderColor: state.isFocused ? "#16a34a" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": {
      borderColor: "#16a34a",
    },
  }),
  menu: (base: any) => ({
    ...base,
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 50,
  }),
  valueContainer: (base: any) => ({
    ...base,
    paddingLeft: 12,
    paddingRight: 12,
  }),
  placeholder: (base: any) => ({
    ...base,
    color: "#94a3b8",
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isFocused ? "#f1f5f9" : "white",
    color: "#0f172a",
    cursor: "pointer",
  }),
};

export default function PosPage() {
  const productList = useMemo(() => {
    return (products as Product[]).map((item) => ({
      ...item,
      price: parsePrice(item.price),
      stock: item.stock ?? 20,
      barcode: item.barcode ?? item.sku,
      category: item.category ?? "Uncategorized",
    }));
  }, []);

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
  const [selectedCategory, setSelectedCategory] = useState<SelectOption | null>(
    categoryOptions[0],
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectOption | null>(
    mockCustomers[0],
  );
  const [paymentType, setPaymentType] = useState<SelectOption | null>(null);

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

  const quickProducts = useMemo(() => {
    return productList.slice(0, 8);
  }, [productList]);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  const discount = 0;
  const total = subtotal - discount;

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.sku === product.sku);

      if (existing) {
        return prev.map((item) =>
          item.sku === product.sku ? { ...item, qty: item.qty + 1 } : item,
        );
      }

      return [
        ...prev,
        {
          sku: product.sku,
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
          const nextQty = type === "increase" ? item.qty + 1 : item.qty - 1;
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
    setSelectedCustomer(mockCustomers[0]);
    setPaymentType(null);
    setSearch("");
    setSelectedCategory(categoryOptions[0]);
  };

  const handleCheckout = async () => {
    const payload = {
      customerId:
        selectedCustomer?.value === "guest" ? null : selectedCustomer?.value,
      customerType:
        selectedCustomer?.value === "guest" ? "GUEST" : "REGISTERED",
      paymentType: paymentType?.value ?? null,
      items: cart.map((item) => ({
        sku: item.sku,
        quantity: item.qty,
        unitPrice: item.price,
        lineTotal: item.qty * item.price,
      })),
      subtotal,
      discount,
      total,
    };

    console.log("POS CHECKOUT PAYLOAD", payload);

    /**
     * Backend-ready:
     * await fetch("/api/pos/sales", {
     *   method: "POST",
     *   headers: { "Content-Type": "application/json" },
     *   body: JSON.stringify(payload),
     * });
     */
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              POS / Sales
            </h1>
            <p className="text-sm text-slate-500">
              Fast walk-in sales screen optimized for large product catalogs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={clearSale}>
              New Sale
            </Button>
            <Button variant="outline">Hold Sale</Button>
            <Button
              onClick={handleCheckout}
              disabled={!cart.length || !paymentType}
            >
              Checkout
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1800px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[1.5fr_0.9fr] lg:px-8">
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
                Use barcode, SKU, product name, or category to find items fast.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Scan barcode or search product"
                    className="pl-9"
                  />
                </div>

                <Select
                  instanceId="category-select"
                  options={categoryOptions}
                  value={selectedCategory}
                  onChange={(option) => setSelectedCategory(option)}
                  isSearchable
                  placeholder="Filter category"
                  styles={selectStyles}
                />

                <Button variant="outline" className="h-11">
                  <ScanLine className="mr-2 size-4" />
                  Scan
                </Button>
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
                    filteredProducts.map((product) => (
                      <div
                        key={product.sku}
                        className="grid grid-cols-[1.8fr_1fr_110px_130px_120px] items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            SKU: {product.sku}
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

              <p className="text-xs text-slate-500">
                Showing {filteredProducts.length} product
                {filteredProducts.length !== 1 ? "s" : ""}.
              </p>
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
                options={mockCustomers}
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

            <Separator />

            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {cart.length === 0 ? (
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

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={!cart.length || !paymentType}
            >
              <CreditCard className="mr-2 size-4" />
              Complete Sale
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
