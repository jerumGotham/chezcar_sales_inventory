"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Route } from "next";
import { useRouter } from "next/navigation";
import Select from "react-select";
import type { StylesConfig } from "react-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, UserRound, Package2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useShellAccess } from "@/components/shell-access-context";
import { canManageCustomerOrders } from "@/lib/customer-order-actions";

type SelectOption = {
  value: string;
  label: string;
};

type OrderItemRow = {
  item: SelectOption | null;
  quantity: number;
  unitPrice: number;
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "RESERVED", label: "Reserved" },
  { value: "WAITING_STOCK", label: "Waiting for stock" },
];

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

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

type OrderOptions = {
  customers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; itemCode: string; name: string; price: number; availableQuantity: number }>;
  branches: Array<{ id: string; code: string; name: string }>;
};

async function fetchOrderOptions(locationId: string, includeUnavailable: boolean) {
  const response = await fetch(`/api/customer-orders/options?locationId=${encodeURIComponent(locationId)}&includeUnavailable=${includeUnavailable}`, { credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message ?? "Unable to load order options");
  return json.data as OrderOptions;
}

export default function CreateCustomerOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useShellAccess();
  const role = access.authenticated ? access.identity.role : null;
  const [location, setLocation] = useState<SelectOption | null>(null);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[1]);
  const branchStaffLocationId = access.authenticated ? access.scope.locationId : null;
  const activeLocationId = role === "ADMIN" ? location?.value ?? null : branchStaffLocationId;
  const includeUnavailable = status.value === "WAITING_STOCK";
  const optionsQuery = useQuery({
    queryKey: ["customer-order-options", activeLocationId, { includeUnavailable }],
    queryFn: () => fetchOrderOptions(activeLocationId ?? "", includeUnavailable),
    enabled: role === "ADMIN" || Boolean(activeLocationId),
  });
  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [downpayment, setDownpayment] = useState("0");
  const [downpaymentReceiptNumber, setDownpaymentReceiptNumber] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<OrderItemRow[]>([
    {
      item: null,
      quantity: 1,
      unitPrice: 0,
    },
  ]);
  const [errorMessage, setErrorMessage] = useState("");

  const customerOptions = optionsQuery.data?.customers.map((item) => ({ value: item.id, label: item.name })) ?? [];
  const itemOptions = optionsQuery.data?.products.map((item) => ({ value: item.id, label: `${item.itemCode} - ${item.name} (${item.availableQuantity} available)` })) ?? [];
  const productById = new Map((optionsQuery.data?.products ?? []).map((item) => [item.id, item]));

  useEffect(() => {
    // Location changes reset the draft to avoid carrying lines across branches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([{ item: null, quantity: 1, unitPrice: 0 }]);
  }, [activeLocationId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error("Select a customer.");
      if (role === "ADMIN" && !location) throw new Error("Select a branch.");
      if (items.some((item) => !item.item || item.quantity < 1)) throw new Error("Select a product and valid quantity for every line.");
      if (status.value === "RESERVED" && items.some((item) => item.item && item.quantity > (productById.get(item.item.value)?.availableQuantity ?? 0))) throw new Error("Order quantity cannot exceed available branch stock.");
      const orderType = status.value === "WAITING_STOCK"
        ? "WAITING_STOCK"
        : Number(downpayment) > 0
          ? "RESERVATION_WITH_DP"
          : "RESERVATION_NO_DP";
      if (orderType === "RESERVATION_WITH_DP" && !downpaymentReceiptNumber.trim()) throw new Error("Downpayment receipt number is required when an amount is entered.");

      const response = await fetch("/api/customer-orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { id: customer.value, name: customer.label },
          locationId: location?.value,
          type: orderType,
          expectedReleaseDate: releaseDate || undefined,
          notes: notes || undefined,
          downpaymentAmount: orderType === "RESERVATION_WITH_DP" ? Number(downpayment) : 0,
          downpaymentReceiptNumber: orderType === "RESERVATION_WITH_DP" ? downpaymentReceiptNumber : undefined,
          lines: items.map((item) => ({ productId: item.item!.value, quantity: item.quantity, finalUnitPrice: item.unitPrice })),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? "Unable to save customer order");
      return json.data as { orderNo: string };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-orders-list"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customer-history"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      ]);
      router.push("/customer-orders");
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

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
               unitPrice: option ? (productById.get(option.value)?.price ?? 0) : 0,
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

  return (
    <PageShell
      title="Create Customer Order"
      subtitle="Create a reservation or special order with multiple products."
      actions={
        <div className="flex gap-2">
          <Link href={"/customer-orders" as Route}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
           {canManageCustomerOrders(role) ? <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setErrorMessage(""); saveMutation.mutate(); }} disabled={saveMutation.isPending || optionsQuery.isLoading}>
             {saveMutation.isPending ? "Saving..." : "Save Order"}
           </Button> : null}
        </div>
      }
    >
      {!activeLocationId ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Select a branch to load available stock before adding order items.</p> : null}
      {optionsQuery.isError ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(optionsQuery.error as Error).message}</p> : null}
      {errorMessage ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</p> : null}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Customer</Label>
                    <Link href="/customers" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">Manage customers</Link>
                  </div>
                  <Select
                    instanceId="create-order-customer"
                     options={customerOptions}
                    value={customer}
                    onChange={(option) => setCustomer(option)}
                    isSearchable
                    placeholder="Select customer"
                    styles={reactSelectStyles}
                  />
                  {optionsQuery.data && customerOptions.length === 0 ? <p className="text-xs text-amber-700">No active customers yet. Add one from the Customers page.</p> : null}
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
                    options={STATUS_OPTIONS}
                    value={status}
                    onChange={(option) =>
                       setStatus(option ?? STATUS_OPTIONS[1])
                    }
                    isSearchable
                    styles={reactSelectStyles}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Branch</Label>
                  {role === "ADMIN" ? (
                    <Select
                      instanceId="create-order-location"
                      options={optionsQuery.data?.branches.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` })) ?? []}
                      value={location}
                      onChange={(option) => setLocation(option)}
                      isSearchable
                      placeholder="Select branch"
                      styles={reactSelectStyles}
                    />
                  ) : (
                    <Input value={access.authenticated ? access.scope.label : ""} disabled />
                  )}
                </div>

                {status.value === "RESERVED" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Downpayment Amount</Label>
                      <Input type="number" min="0.01" value={downpayment} onChange={(e) => setDownpayment(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Downpayment Receipt No.</Label>
                      <Input value={downpaymentReceiptNumber} onChange={(e) => setDownpaymentReceiptNumber(e.target.value)} placeholder="OR-000123" />
                    </div>
                  </>
                ) : null}

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

                  <Button variant="outline" onClick={handleAddItem} disabled={!optionsQuery.data || itemOptions.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {optionsQuery.data && itemOptions.length === 0 ? <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{includeUnavailable ? "No active products are available for ordering." : "No available stock at this branch. Select Waiting for stock to order unavailable products."}</div> : null}
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
                             onChange={(option) => handleChangeItem(index, option)}
                             isDisabled={!optionsQuery.data || itemOptions.length === 0}
                            isSearchable
                            placeholder="Select product"
                            styles={reactSelectStyles}
                          />
                        </div>

                        <div className="space-y-2">
                           <Label>Quantity {row.item && !includeUnavailable ? `(max ${productById.get(row.item.value)?.availableQuantity ?? 0})` : ""}</Label>
                           <Input
                             type="number"
                             min={1}
                             max={row.item && !includeUnavailable ? productById.get(row.item.value)?.availableQuantity : undefined}
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
                     disabled={status.value !== "RESERVED"}
                  />
                </div>

                <div className="flex items-center justify-between border-t pt-4 text-base font-semibold">
                  <span>Balance</span>
                  <span>{formatPeso(balance)}</span>
                </div>

                 {canManageCustomerOrders(role) ? <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => { setErrorMessage(""); saveMutation.mutate(); }} disabled={saveMutation.isPending || optionsQuery.isLoading}>
                   {saveMutation.isPending ? "Saving..." : "Save Order"}
                 </Button> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
