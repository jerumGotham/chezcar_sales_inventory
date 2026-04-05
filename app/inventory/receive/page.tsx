"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Select from "react-select";
import { ArrowLeft, Plus, Save, Trash2, Truck } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  MAIN_WAREHOUSE,
  PRODUCT_OPTIONS,
  createBatchLine,
  reactSelectStyles,
  type BatchLineRow,
  type SelectOption,
} from "../_data";

export default function ReceiveStockPage() {
  const [referenceNo, setReferenceNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<BatchLineRow[]>([createBatchLine()]);

  const addLine = () => {
    setLines((prev) => [...prev, createBatchLine()]);
  };

  const removeLine = (rowId: string) => {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId),
    );
  };

  const updateLine = (
    rowId: string,
    field: "product" | "qty",
    value: SelectOption | null | string,
  ) => {
    setLines((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  };

  const totalLines = lines.length;

  const totalQty = useMemo(() => {
    return lines.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  }, [lines]);

  return (
    <PageShell
      title="Receive Stock"
      subtitle="Receive one or many products into Main Warehouse in a single inventory transaction."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Inventory
            </Button>
          </Link>

          <Button variant="outline">
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>

          <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
            Submit Receiving
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Receive To</Label>
                <Input value={MAIN_WAREHOUSE} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receive-reference">Reference No.</Label>
                <Input
                  id="receive-reference"
                  placeholder="DR-000123 / RCV-000123"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receive-supplier">Supplier</Label>
                <Input
                  id="receive-supplier"
                  placeholder="Supplier or source of stock"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="receive-checked-by">
                  Checked / Received By
                </Label>
                <Input
                  id="receive-checked-by"
                  placeholder="Name of staff or admin"
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="receive-remarks">Remarks</Label>
                <Input
                  id="receive-remarks"
                  placeholder="Supplier delivery, opening balance, replenishment, etc."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Receive Items
                  </h3>
                  <p className="text-sm text-slate-500">
                    Add multiple products and quantities for one receiving
                    transaction.
                  </p>
                </div>

                <Button variant="outline" onClick={addLine}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product Line
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-50">
                    <tr className="border-b">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Product
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quantity
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lines.map((row) => (
                      <tr key={row.id} className="border-b">
                        <td className="px-5 py-4">
                          <Select
                            instanceId={`receive-product-${row.id}`}
                            options={PRODUCT_OPTIONS}
                            value={row.product}
                            onChange={(option) =>
                              updateLine(row.id, "product", option)
                            }
                            isSearchable
                            placeholder="Select product"
                            styles={reactSelectStyles}
                          />
                        </td>

                        <td className="px-5 py-4">
                          <Input
                            type="number"
                            placeholder="0"
                            value={row.qty}
                            onChange={(e) =>
                              updateLine(row.id, "qty", e.target.value)
                            }
                          />
                        </td>

                        <td className="px-5 py-4">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeLine(row.id)}
                            disabled={lines.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-50 p-2">
                  <Truck className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Receiving Summary
                  </h3>
                  <p className="text-sm text-slate-500">
                    Quick overview before saving
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-slate-500">Receive To</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {MAIN_WAREHOUSE}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-slate-500">Total Lines</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {totalLines}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-slate-500">Total Quantity</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {totalQty}
                  </span>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                All newly received stocks are added to{" "}
                <span className="font-semibold">{MAIN_WAREHOUSE}</span> first.
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button variant="outline">Save Draft</Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Submit Receiving
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
