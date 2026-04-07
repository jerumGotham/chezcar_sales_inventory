"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Select from "react-select";
import { Plus, Trash2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SelectOption = {
  value: string;
  label: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
};

type FormItemRow = {
  item: SelectOption | null;
  quantity: number;
  unitPrice: number;
};

const BRANCH_OPTIONS: SelectOption[] = [
  { value: "QC Main", label: "QC Main" },
  { value: "Makati", label: "Makati" },
  { value: "Pasig", label: "Pasig" },
];

const STATUS_OPTIONS: SelectOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in-progress", label: "In Progress" },
  { value: "ready-for-release", label: "Ready for Release" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const CUSTOMERS: SelectOption[] = [
  { value: "mark-reyes", label: "Mark Reyes" },
  { value: "paolo-santos", label: "Paolo Santos" },
  { value: "gina-lopez", label: "Gina Lopez" },
  { value: "anna-garcia", label: "Anna Garcia" },
  { value: "leo-mendoza", label: "Leo Mendoza" },
];

const PRODUCT_OPTIONS: Product[] = [
  { id: "PROD-001", name: "3M Tint Full Set", price: 8500 },
  { id: "PROD-002", name: "Ceramic Tint", price: 12000 },
  { id: "PROD-003", name: "Reverse Camera", price: 3500 },
  { id: "PROD-004", name: "Android Head Unit", price: 15000 },
  { id: "PROD-005", name: "Dash Cam", price: 4800 },
  { id: "PROD-006", name: "Bosch Horn Set", price: 2200 },
];

const reactSelectStyles = {
  control: (base: any, state: any) => ({
    ...base,
    minHeight: "40px",
    borderRadius: "0.75rem",
    borderColor: state.isFocused ? "#10b981" : "#e2e8f0",
    boxShadow: "none",
    "&:hover": { borderColor: "#10b981" },
  }),
  valueContainer: (base: any) => ({
    ...base,
    paddingLeft: "10px",
    paddingRight: "10px",
  }),
  input: (base: any) => ({ ...base, color: "#0f172a" }),
  placeholder: (base: any) => ({ ...base, color: "#94a3b8", fontSize: "14px" }),
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

const EMPTY_ITEM_ROW: FormItemRow = {
  item: null,
  quantity: 1,
  unitPrice: 0,
};

function formatPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CreateJobOrderPage() {
  const router = useRouter();

  const [customer, setCustomer] = useState<SelectOption | null>(null);
  const [vehicle, setVehicle] = useState("");
  const [jobBranch, setJobBranch] = useState<SelectOption>(BRANCH_OPTIONS[0]);
  const [jobStatus, setJobStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);
  const [service, setService] = useState("");
  const [serviceFee, setServiceFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<FormItemRow[]>([]);

  const productOptions = useMemo<SelectOption[]>(
    () =>
      PRODUCT_OPTIONS.map((item) => ({
        value: item.id,
        label: item.name,
      })),
    [],
  );

  const productPriceMap = useMemo<Record<string, number>>(
    () =>
      PRODUCT_OPTIONS.reduce(
        (acc, item) => {
          acc[item.id] = item.price;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [],
  );

  const partsTotal = useMemo(
    () => items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0),
    [items],
  );

  const parsedServiceFee = Number(serviceFee || 0);
  const totalAmount = partsTotal + parsedServiceFee;

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM_ROW }]);
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
          ? { ...row, quantity: Number.isNaN(value) ? 1 : Math.max(1, value) }
          : row,
      ),
    );
  };

  const handleSave = () => {
    const payload = {
      customer: customer?.label ?? null,
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
    router.push("/job-orders");
  };

  return (
    <PageShell
      title="Create Job Order"
      subtitle="Create a new service or installation transaction. Items are optional."
      actions={
        <>
          <Button variant="outline" onClick={() => router.push("/job-orders")}>
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleSave}
          >
            Save Job Order
          </Button>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  instanceId="create-job-order-customer"
                  options={CUSTOMERS}
                  value={customer}
                  onChange={(option) => setCustomer(option)}
                  isSearchable
                  placeholder="Select customer"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Input
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="Toyota Rush 2022"
                />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select
                  instanceId="create-job-order-branch"
                  options={BRANCH_OPTIONS}
                  value={jobBranch}
                  onChange={(option) =>
                    setJobBranch(option ?? BRANCH_OPTIONS[0])
                  }
                  isSearchable
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  instanceId="create-job-order-status"
                  options={STATUS_OPTIONS}
                  value={jobStatus}
                  onChange={(option) =>
                    setJobStatus(option ?? STATUS_OPTIONS[0])
                  }
                  isSearchable
                  styles={reactSelectStyles}
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
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Items / Parts
                  </h3>
                  <p className="text-sm text-slate-500">
                    Optional. You can leave this empty for service-only
                    transactions.
                  </p>
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
                Summary
              </h3>

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

              <Button
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handleSave}
              >
                Save Job Order
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
