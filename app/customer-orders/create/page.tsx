"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Route } from "next";
import Select from "react-select";
import { ArrowLeft, Plus, Trash2, UserRound, Package2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type SelectOption = {
  value: string;
  label: string;
};

type OrderItemRow = {
  item: SelectOption | null;
  quantity: number;
  unitPrice: number;
};

const CUSTOMER_OPTIONS: SelectOption[] = [
  { value: "cust-1", label: "Juan Dela Cruz" },
  { value: "cust-2", label: "Maria Santos" },
  { value: "cust-3", label: "Paolo Reyes" },
  { value: "cust-4", label: "Angela Villanueva" },
  { value: "cust-5", label: "Mark Bautista" },
];

const ITEM_OPTIONS: SelectOption[] = [
  { value: "3M Tint Medium Black", label: "3M Tint Medium Black" },
  { value: "Seat Cover Set", label: "Seat Cover Set" },
  { value: "Android Head Unit 9in", label: "Android Head Unit 9in" },
  { value: "LED Fog Lamp Set", label: "LED Fog Lamp Set" },
  { value: "Nano Ceramic Tint", label: "Nano Ceramic Tint" },
  { value: "Premium Seat Cover Beige", label: "Premium Seat Cover Beige" },
  { value: "LED Headlight Bulb", label: "LED Headlight Bulb" },
  { value: "Rear Spoiler", label: "Rear Spoiler" },
];

const ITEM_PRICE_MAP: Record<string, number> = {
  "3M Tint Medium Black": 8500,
  "Seat Cover Set": 6000,
  "Android Head Unit 9in": 12500,
  "LED Fog Lamp Set": 3500,
  "Nano Ceramic Tint": 14500,
  "Premium Seat Cover Beige": 7200,
  "LED Headlight Bulb": 2200,
  "Rear Spoiler": 6800,
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: "Reserved", label: "Reserved" },
  { value: "Pending", label: "Pending" },
  { value: "For Release", label: "For Release" },
];

const PAYMENT_OPTIONS: SelectOption[] = [
  { value: "Unpaid", label: "Unpaid" },
  { value: "Partial", label: "Partial" },
  { value: "Paid", label: "Paid" },
];

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

function formatPeso(value: number) {
  return `₱${value.toLocaleString("en-PH")}`;
}

export default function CreateCustomerOrderPage() {
  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);
  const [paymentStatus, setPaymentStatus] = useState<SelectOption>(
    PAYMENT_OPTIONS[0],
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
              unitPrice: option ? (ITEM_PRICE_MAP[option.value] ?? 0) : 0,
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
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
            Save Order
          </Button>
        </div>
      }
    >
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
                  <Label>Customer</Label>
                  <Select
                    instanceId="create-order-customer"
                    options={CUSTOMER_OPTIONS}
                    value={customer}
                    onChange={(option) => setCustomer(option)}
                    isSearchable
                    placeholder="Select customer"
                    styles={reactSelectStyles}
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
                    options={STATUS_OPTIONS}
                    value={status}
                    onChange={(option) =>
                      setStatus(option ?? STATUS_OPTIONS[0])
                    }
                    isSearchable
                    styles={reactSelectStyles}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <Select
                    instanceId="create-order-payment-status"
                    options={PAYMENT_OPTIONS}
                    value={paymentStatus}
                    onChange={(option) =>
                      setPaymentStatus(option ?? PAYMENT_OPTIONS[0])
                    }
                    isSearchable
                    styles={reactSelectStyles}
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
                            options={ITEM_OPTIONS}
                            value={row.item}
                            onChange={(option) =>
                              handleChangeItem(index, option)
                            }
                            isSearchable
                            placeholder="Select product"
                            styles={reactSelectStyles}
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

                <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
                  Save Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
