"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Select from "react-select";
import { ArrowLeft, Plus, Save, SendHorizontal, Trash2 } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  BRANCH_OPTIONS_NO_ALL,
  MAIN_WAREHOUSE,
  PRODUCT_OPTIONS,
  createBatchLine,
  reactSelectStyles,
  type BatchLineRow,
  type SelectOption,
} from "../_data";

export default function TransferToBranchPage() {
  const [transferTo, setTransferTo] = useState<SelectOption | null>(
    BRANCH_OPTIONS_NO_ALL[0],
  );
  const [referenceNo, setReferenceNo] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
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
      title="Transfer to Branch"
      subtitle="Transfer multiple products from Main Warehouse to one selected branch in a single transaction."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Inventory
            </Button>
          </Link>

          {/* <Button variant="outline">
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button> */}

          <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
            Save Transfer
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 p-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>From</Label>
                <Input value={MAIN_WAREHOUSE} disabled />
              </div>

              <div className="space-y-2">
                <Label>To Branch</Label>
                <Select
                  instanceId="transfer-to"
                  options={BRANCH_OPTIONS_NO_ALL}
                  value={transferTo}
                  onChange={(option) => setTransferTo(option)}
                  isSearchable
                  placeholder="Select branch"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer-reference">Reference No.</Label>
                <Input
                  id="transfer-reference"
                  placeholder="TRF-000123"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="transfer-requested-by">
                  Requested / Prepared By
                </Label>
                <Input
                  id="transfer-requested-by"
                  placeholder="Name of staff or admin"
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="transfer-remarks">Remarks</Label>
                <Input
                  id="transfer-remarks"
                  placeholder="Branch replenishment, stock allocation, urgent request, etc."
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
                    Transfer Items
                  </h3>
                  <p className="text-sm text-slate-500">
                    Add one or more products for this transfer.
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
                        Transfer Qty
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
                            instanceId={`transfer-product-${row.id}`}
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
                <div className="rounded-full bg-violet-50 p-2">
                  <SendHorizontal className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    Transfer Summary
                  </h3>
                  <p className="text-sm text-slate-500">Review before saving</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-slate-500">From</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {MAIN_WAREHOUSE}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-slate-500">To Branch</span>
                  <span className="text-sm font-semibold text-slate-700">
                    {transferTo?.label ?? "-"}
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

              <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-700">
                For branch-to-branch transfer, use the separate{" "}
                <span className="font-semibold">Stock Transfer</span> menu.
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Save Transfer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
