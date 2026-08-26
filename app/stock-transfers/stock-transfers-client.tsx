"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle, CheckCircle2, X } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShellRole } from "@/lib/contracts/access";

type TransferLine = {
  id: string;
  product: { id: string; itemCode: string; name: string };
  requestedQuantity: number;
  dispatchedQuantity: number;
  inTransitQuantity: number;
  discrepancy: { actualQuantity: number; reason: string } | null;
  resolution?: { destinationQty: number; restoreToSrQty: number; lossQty: number } | null;
};

type TransferTimelineItem = { label: string; actor: string; at: string; notes?: string };
type TransferMovement = {
  id: string;
  type: string;
  quantity: number;
  occurredAt: string;
  actor: string;
  product: { itemCode: string; name: string };
  location: { code: string; name: string } | null;
};

type Transfer = {
  id: string;
  reference: string;
  status: string;
  version: number;
  destination: { id: string; code: string; name: string };
  lines: TransferLine[];
  discrepancy: { notes: string } | null;
  investigation: { findings: string } | null;
  resolution: { notes: string; postedAt: string } | null;
  timeline?: TransferTimelineItem[];
  movements?: TransferMovement[];
};

type Option = { id: string; code: string; name: string };
type Product = { id: string; itemCode: string; name: string };
type DraftLine = { productId: string; quantity: number };
type ShortageResolution = "loss" | "restore";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error?.message ?? "Request failed");
  }

  return json.data;
}

export function StockTransfersClient({
  role,
  branches,
  products,
  initialTransferId,
}: {
  role: ShellRole;
  branches: Option[];
  products: Product[],
  initialTransferId?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedTransferId, setSelectedTransferId] = useState(initialTransferId ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [replacementForTransferId, setReplacementForTransferId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    { productId: "", quantity: 1 },
  ]);
  const [editLines, setEditLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");
  const [actualQuantities, setActualQuantities] = useState<Record<string, number>>({});
  const [shortageResolutions, setShortageResolutions] = useState<Record<string, ShortageResolution>>({});
  const discrepancyNotesRef = useRef<HTMLSelectElement>(null);
  const discrepancyReasonRef = useRef<HTMLInputElement>(null);
  const [affectedQuantity, setAffectedQuantity] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  function notify(text: string, kind: "success" | "error" = "success") { setMessage(text); setMessageKind(kind); }

  const transfers = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: () => request<Transfer[]>("/api/stock-transfers"),
  });
  const selected = selectedTransferId
    ? transfers.data?.find((transfer) => transfer.id === selectedTransferId) ?? null
    : null;
  const rememberTransfer = (transfer: Transfer) => {
    setSelectedTransferId(transfer.id);
    queryClient.setQueryData<Transfer[]>(["stock-transfers"], (current) => {
      if (!current) return [transfer];
      const exists = current.some((item) => item.id === transfer.id);
      return exists
        ? current.map((item) => item.id === transfer.id ? transfer : item)
        : [transfer, ...current];
    });
  };

  const updateDraftMutation = useMutation({
    mutationFn: ({ transferId, version, lines }: { transferId: string; version: number; lines: DraftLine[] }) => {
      return request<Transfer>(`/api/stock-transfers/${transferId}/update`, "POST", { version, lines });
    },
    onSuccess: (transfer) => {
      notify("Draft updated successfully.");
      setValidationErrors([]);
      rememberTransfer(transfer);
      setEditLines((transfer.lines ?? []).map((line) => ({ productId: line.product.id, quantity: line.requestedQuantity })));
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: ({ transferId }: { transferId: string }) => {
      return request<{ id: string }>(`/api/stock-transfers/${transferId}/delete`, "POST", {});
    },
    onSuccess: () => {
      notify("Draft deleted successfully.");
      setSelectedTransferId("");
      setDestinationId("");
      setReplacementForTransferId("");
      setDraftLines([{ productId: "", quantity: 1 }]);
      setNotes("");
      setActualQuantities({});
      setShortageResolutions({});
      setAffectedQuantity("");
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });

  const mutation = useMutation({
    mutationFn: ({ action, body }: { action: string; body: unknown }) => {
      if (action === "create") {
        return request<Transfer>("/api/stock-transfers", "POST", body);
      }

      if (!selected) {
        throw new Error("Select a transfer first.");
      }

      return request<Transfer>(
        `/api/stock-transfers/${selected.id}/${action}`,
        "POST",
        body,
      );
    },
    onSuccess: (transfer) => {
      notify("Transfer created successfully.");
      setValidationErrors([]);
      rememberTransfer(transfer);
      setEditLines((transfer.lines ?? []).map((line) => ({ productId: line.product.id, quantity: line.requestedQuantity })));
      setDestinationId("");
      setReplacementForTransferId("");
      setDraftLines([{ productId: "", quantity: 1 }]);
      queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
    },
    onError: (error: Error) => notify(error.message, "error"),
  });

  const selectTransfer = (transfer: Transfer) => {
    if (selected?.id === transfer.id) {
      setSelectedTransferId("");
      setNotes("");
      setActualQuantities({});
      setShortageResolutions({});
      setAffectedQuantity("");
      setEditLines([]);
      return;
    }

    setSelectedTransferId(transfer.id);
    setNotes("");
    setActualQuantities({});
    setShortageResolutions({});
    setAffectedQuantity("");
    if (transfer.status === "DRAFT") {
      setEditLines((transfer.lines ?? []).map((line) => ({ productId: line.product.id, quantity: line.requestedQuantity })));
    }
  };

  const createTransfer = () => {
    const errors: string[] = [];

    if (!destinationId) {
      errors.push("Select a destination branch.");
    }

    draftLines.forEach((line, index) => {
      if (!line.productId) {
        errors.push(`Select a product for line ${index + 1}.`);
      }

      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        errors.push(`Enter a valid quantity for line ${index + 1}.`);
      }
    });

    if (hasDuplicateProducts) {
      errors.push("Each product can be added only once per transfer.");
    }

    if (hasDuplicateDestination) {
      errors.push("A draft for this destination already exists. Edit that draft instead.");
    }

    setValidationErrors(errors);
    if (errors.length > 0) return;

    mutation.mutate({
      action: "create",
      body: { destinationId, lines: draftLines, replacementForTransferId: replacementForTransferId || undefined },
    });
  };

  const act = (action: string, body: object) => {
    mutation.mutate({
      action,
      body: { version: selected?.version, ...body },
    });
  };

  const affectedQtyValue = Number(affectedQuantity);
  const hasAffectedQuantity = Number.isInteger(affectedQtyValue) && affectedQtyValue >= 1;
  const hasDuplicateProducts = draftLines.some(
    (line, index) =>
      line.productId &&
      draftLines.some(
        (otherLine, otherIndex) =>
          otherIndex !== index && otherLine.productId === line.productId,
      ),
  );

  const hasDuplicateDestination = destinationId
    ? transfers.data?.some(
      (t) => t.status === "DRAFT" && t.destination.id === destinationId,
    ) ?? false
    : false;

  const resolutionLines = selected?.lines?.map((line) => {
    const actualQuantity = line.discrepancy?.actualQuantity ?? 0;
    const shortageQuantity = Math.max(0, line.inTransitQuantity - actualQuantity);
    const resolution = shortageResolutions[line.id] ?? "loss";

    return {
      lineId: line.id,
      destinationQuantity: actualQuantity,
      restoreToSrQuantity: resolution === "restore" ? shortageQuantity : 0,
      lossQuantity: resolution === "loss" ? shortageQuantity : 0,
    };
  }) ?? [];

  const shortageDraftLines = selected?.lines
    ?.map((line) => {
      const actualQuantity = line.discrepancy?.actualQuantity ?? line.dispatchedQuantity;
      const resolvedShortage = line.resolution
        ? line.resolution.restoreToSrQty + line.resolution.lossQty
        : Math.max(0, line.dispatchedQuantity - actualQuantity);

      return { productId: line.product.id, quantity: resolvedShortage };
    })
    .filter((line) => line.quantity > 0) ?? [];

  const startReplacementDraft = () => {
    if (!selected || shortageDraftLines.length === 0) return;

    setDestinationId(selected.destination.id);
    setReplacementForTransferId(selected.id);
    setDraftLines(shortageDraftLines);
    setSelectedTransferId("");
    setValidationErrors([]);
    notify("Replacement draft started from the resolved shortage. Review quantities before creating.");
  };

  const updateDraftProduct = (index: number, productId: string) => {
    setValidationErrors([]);
    setDraftLines((current) => {
      const alreadySelected = current.some(
        (line, lineIndex) => lineIndex !== index && line.productId === productId,
      );

      return current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, productId: alreadySelected ? "" : productId }
          : item,
      );
    });
  };

  return (
    <PageShell
      title="Stock Transfers"
      subtitle="Move stock from Stock Room to a branch, confirm delivery, and resolve any discrepancy."
    >
      {message && (
        <div className={`mb-4 flex items-start justify-between rounded-lg border px-4 py-3 text-sm ${messageKind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          <div className="flex items-start gap-2">
            {messageKind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage("")} className="ml-3 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"><X className="size-4" /></button>
        </div>
      )}

      {role === "STOCK_STAFF" && (
        <Card className="mb-6">
          <CardContent className="grid gap-3 p-5">
            <h2 className="font-semibold">Create Stock Room Transfer</h2>
            <select
              className="h-10 rounded-md border px-3"
              value={destinationId}
              onChange={(event) => {
                setValidationErrors([]);
                setDestinationId(event.target.value);
              }}
            >
              <option value="">Destination branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} ({branch.code})
                </option>
              ))}
            </select>
            {draftLines.map((line, index) => (
              <div className="flex gap-2" key={`${line.productId}-${index}`}>
                <select
                  className="h-10 flex-1 rounded-md border px-3"
                  value={line.productId}
                  onChange={(event) => updateDraftProduct(index, event.target.value)}
                >
                  <option value="">Product</option>
                  {products
                    .filter((product) => {
                      const selectedInAnotherLine = draftLines.some(
                        (otherLine, otherIndex) =>
                          otherIndex !== index && otherLine.productId === product.id,
                      );

                      return product.id === line.productId || !selectedInAnotherLine;
                    })
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.itemCode} - {product.name}
                      </option>
                    ))}
                </select>
                <Input
                  className="w-24"
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(event) =>
                    {
                      setValidationErrors([]);
                      setDraftLines((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, quantity: Number(event.target.value) }
                            : item,
                        ),
                      );
                    }
                  }
                />
                <Button
                  aria-label="Remove product line"
                  disabled={draftLines.length === 1}
                  onClick={() => {
                    setValidationErrors([]);
                    setDraftLines((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                  }}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {validationErrors.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {validationErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setDraftLines((current) => [
                    ...current,
                    { productId: "", quantity: 1 },
                  ])
                }
              >
                Add product
              </Button>
              <Button disabled={mutation.isPending} onClick={createTransfer}>
                Create draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selected && selected.status === "DRAFT" && (
        <Card className="mt-6">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selected.reference}</h2>
              <Badge className="bg-slate-100 text-slate-700">{selected.status}</Badge>
            </div>
            {role === "STOCK_STAFF" && editLines.length > 0 && (
              <div className="space-y-3">
                {editLines.map((line, index) => (
                  <div className="flex gap-2" key={`${line.productId}-${index}`}>
                    <select
                      className="h-10 flex-1 rounded-md border px-3"
                      value={line.productId}
                      onChange={(event) => {
                        const val = event.target.value;
                        setEditLines((current) => {
                          const dup = current.some((l, i) => i !== index && l.productId === val);
                          return current.map((item, i) => i === index ? { ...item, productId: dup ? "" : val } : item);
                        });
                      }}
                    >
                      <option value="">Product</option>
                      {products.filter((p) => p.id === line.productId || !editLines.some((l, i) => i !== index && l.productId === p.id)).map((p) => (
                        <option key={p.id} value={p.id}>{p.itemCode} - {p.name}</option>
                      ))}
                    </select>
                    <Input
                      className="w-24"
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) => setEditLines((current) => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))}
                    />
                    <Button
                      aria-label="Remove product line"
                      disabled={editLines.length === 1}
                      onClick={() => setEditLines((current) => current.filter((_, i) => i !== index))}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditLines((current) => [...current, { productId: "", quantity: 1 }])}>
                    Add product
                  </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={updateDraftMutation.isPending}
                  onClick={() => {
                    const errs: string[] = [];
                    if (editLines.some((l) => !l.productId)) errs.push("Select a product for every line.");
                    if (editLines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) errs.push("Quantity must be a whole number at least 1.");
                    if (editLines.some((l, i) => l.productId && editLines.some((o, j) => j !== i && o.productId === l.productId))) errs.push("Each product can appear only once.");
                    if (errs.length > 0) { notify(errs.join(" "), "error"); return; }
                    updateDraftMutation.mutate({ transferId: selected.id, version: selected.version, lines: editLines });
                  }}
                >
                  Update draft
                </Button>
                </div>
              </div>
            )}
            {role !== "STOCK_STAFF" && (
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th>Product</th><th>Requested</th></tr></thead>
                <tbody>
                  {selected.lines?.map((line) => (
                    <tr key={line.id}>
                      <td>{line.product.itemCode} - {line.product.name}</td>
                      <td>{line.requestedQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {role === "STOCK_STAFF" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                  disabled={mutation.isPending}
                  onClick={() => act("finalize", {})}
                >
                  Finalize for dispatch
                </Button>
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={deleteDraftMutation.isPending}
                  onClick={() => deleteDraftMutation.mutate({ transferId: selected.id })}
                >
                  Delete draft
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selected && selected.status !== "DRAFT" && (
        <Card className="mt-6">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{selected.reference}</h2>
              <Badge className="bg-slate-100 text-slate-700">{selected.status}</Badge>
            </div>
            <p className="text-sm text-slate-500">
              Source is Stock Room. In-transit stock cannot be sold until the branch confirms receipt or an Admin resolves a discrepancy.
            </p>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Product</th><th>Sent</th><th>In transit</th><th>Reported</th></tr></thead>
              <tbody>
                {selected.lines?.map((line) => (
                  <tr key={line.id}>
                    <td>{line.product.itemCode} - {line.product.name}</td>
                    <td>{line.dispatchedQuantity || line.requestedQuantity}</td>
                    <td>{line.inTransitQuantity}</td>
                    <td>{line.discrepancy?.actualQuantity ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {selected.discrepancy && <p className="text-sm"><b>Branch report:</b> {selected.discrepancy.notes}</p>}
            {selected.investigation && <p className="text-sm"><b>Investigation:</b> {selected.investigation.findings}</p>}
            {selected.status === "RESOLVED" && selected.resolution && (
              <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                <div>
                  <p className="font-medium text-emerald-900">Transfer closed by Admin resolution</p>
                  <p className="text-sm text-emerald-800">
                    The original discrepancy transfer is final. Create a separate replacement transfer if the branch still needs the shortage.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-emerald-900">
                        <th className="py-2 pr-3">Product</th>
                        <th className="py-2 pr-3">Branch stock posted</th>
                        <th className="py-2 pr-3">Restored to SR</th>
                        <th className="py-2 pr-3">Written off</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines?.map((line) => (
                        <tr className="border-t border-emerald-200" key={line.id}>
                          <td className="py-3 pr-3">{line.product.itemCode} - {line.product.name}</td>
                          <td className="py-3 pr-3">{line.resolution?.destinationQty ?? 0}</td>
                          <td className="py-3 pr-3">{line.resolution?.restoreToSrQty ?? 0}</td>
                          <td className="py-3 pr-3">{line.resolution?.lossQty ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-emerald-900"><b>Resolution notes:</b> {selected.resolution.notes}</p>
                {role === "STOCK_STAFF" && shortageDraftLines.length > 0 && (
                  <Button variant="outline" onClick={startReplacementDraft}>
                    Create replacement draft for shortage
                  </Button>
                )}
              </div>
            )}

            {role === "STOCK_STAFF" && selected.status === "FOR_DISPATCH" && (
              <Button disabled={mutation.isPending} onClick={() => act("dispatch", {})}>Dispatch from Stock Room</Button>
            )}
            {role === "BRANCH_STAFF" && selected.status === "IN_TRANSIT" && (
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Count the items you received</p>
                  <p className="text-sm text-slate-500">Use Confirm exact receipt only when every count matches the dispatch.</p>
                </div>
                {selected.lines?.map((line) => (
                  <div className="flex items-center justify-between gap-4" key={line.id}>
                    <Label htmlFor={`actual-${line.id}`}>{line.product.name} (sent: {line.dispatchedQuantity})</Label>
                    <Input
                      id={`actual-${line.id}`}
                      className="w-24"
                      type="number"
                      min="0"
                      max={line.dispatchedQuantity}
                      value={actualQuantities[line.id] ?? line.dispatchedQuantity}
                      onChange={(event) =>
                        setActualQuantities((current) => ({
                          ...current,
                          [line.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="discrepancy-notes">What happened?</Label>
                  <select
                    id="discrepancy-notes"
                    ref={discrepancyNotesRef}
                    defaultValue="Items missing"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="Items missing">Items missing</option>
                    <option value="Wrong item delivered">Wrong item delivered</option>
                    <option value="Items damaged">Items damaged</option>
                    <option value="Seal broken / tampered">Seal broken / tampered</option>
                    <option value="Short delivery">Short delivery</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discrepancy-quantity">Missing / damaged quantity *</Label>
                  <Input
                    id="discrepancy-quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={affectedQuantity}
                    onChange={(event) => setAffectedQuantity(event.target.value)}
                    placeholder="How many items are affected?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discrepancy-reason">Reason (optional details)</Label>
                  <Input id="discrepancy-reason" ref={discrepancyReasonRef} placeholder="Optional: add details" />
                </div>
                {!hasAffectedQuantity && (
                  <p className="text-sm text-slate-500">Tip: enter how many items are missing or damaged to enable the report.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={mutation.isPending} onClick={() => act("confirm-receipt", {})}>Confirm exact receipt</Button>
                  <Button
                    variant="outline"
                    disabled={mutation.isPending || !hasAffectedQuantity}
                    onClick={() => {
                      const affected = affectedQtyValue;
                      const manualCounts = Object.keys(actualQuantities).length > 0;
                      act("report-discrepancy", {
                        notes: `${discrepancyNotesRef.current?.value ?? "Items missing"}${discrepancyReasonRef.current?.value ? ` - ${discrepancyReasonRef.current.value}` : ""} (affected: ${affected})`,
                        lines: selected.lines?.map((line, index) => {
                          const counted = actualQuantities[line.id] ?? line.dispatchedQuantity;
                          const actualQuantity = !manualCounts && index === 0
                            ? Math.max(0, line.dispatchedQuantity - affected)
                            : counted;
                          return {
                            lineId: line.id,
                            actualQuantity,
                            reason: discrepancyNotesRef.current?.value ?? "Items missing",
                          };
                        }),
                      });
                    }}
                  >
                    Report discrepancy
                  </Button>
                </div>
              </div>
            )}

            {role === "STOCK_STAFF" && selected.status === "DISCREPANCY_REPORTED" ? (
              <div className="space-y-2">
                <Label htmlFor="transfer-notes">Investigation findings</Label>
                <Input id="transfer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
            ) : null}
            {role === "STOCK_STAFF" && selected.status === "DISCREPANCY_REPORTED" && (
              <Button disabled={!notes.trim() || mutation.isPending} onClick={() => act("investigate", { findings: notes })}>Submit investigation</Button>
            )}
            {role === "ADMIN" && selected.status === "UNDER_REVIEW" && (
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <p className="font-medium">Approve discrepancy resolution</p>
                  <p className="text-sm text-slate-500">
                    Actual received stock goes to the branch. Shortage is written off by default unless it was found in Stock Room.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="py-2 pr-3">Product</th>
                        <th className="py-2 pr-3">Sent</th>
                        <th className="py-2 pr-3">Actual</th>
                        <th className="py-2 pr-3">Shortage</th>
                        <th className="py-2 pr-3">Admin decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines?.map((line) => {
                        const actualQuantity = line.discrepancy?.actualQuantity ?? 0;
                        const shortageQuantity = Math.max(0, line.inTransitQuantity - actualQuantity);

                        return (
                          <tr className="border-t" key={line.id}>
                            <td className="py-3 pr-3">{line.product.itemCode} - {line.product.name}</td>
                            <td className="py-3 pr-3">{line.dispatchedQuantity}</td>
                            <td className="py-3 pr-3">{actualQuantity}</td>
                            <td className="py-3 pr-3">{shortageQuantity}</td>
                            <td className="py-3 pr-3">
                              {shortageQuantity > 0 ? (
                                <select
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                  value={shortageResolutions[line.id] ?? "loss"}
                                  onChange={(event) =>
                                    setShortageResolutions((current) => ({
                                      ...current,
                                      [line.id]: event.target.value as ShortageResolution,
                                    }))
                                  }
                                >
                                  <option value="loss">Write off shortage</option>
                                  <option value="restore">Restore shortage to SR</option>
                                </select>
                              ) : (
                                <span className="text-slate-500">No shortage</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="transfer-notes">Resolution notes</Label>
                  <Input
                    id="transfer-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Example: Approved shortage write-off after investigation."
                  />
                </div>
                <Button
                  disabled={!notes.trim() || mutation.isPending}
                  onClick={() => act("resolve", { notes, lines: resolutionLines })}
                >
                  Approve resolution
                </Button>
              </div>
            )}
            {role === "ADMIN" && selected.timeline && selected.movements && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Admin history</p>
                    <p className="text-sm text-slate-500">Transfer lifecycle events and responsible users.</p>
                  </div>
                  <div className="space-y-3">
                    {selected.timeline.map((item) => (
                      <div className="rounded-md bg-slate-50 p-3 text-sm" key={`${item.label}-${item.at}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-xs text-slate-500">{new Date(item.at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-600">{item.actor}</p>
                        {item.notes && <p className="mt-1 text-slate-500">{item.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Inventory audit</p>
                    <p className="text-sm text-slate-500">Posted movements from dispatch, receipt, restoration, or loss.</p>
                  </div>
                  <div className="space-y-3">
                    {selected.movements.length > 0 ? selected.movements.map((movement) => (
                      <div className="rounded-md bg-slate-50 p-3 text-sm" key={movement.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{movement.type.replaceAll("_", " ")}</span>
                          <span className={movement.quantity < 0 ? "text-red-600" : "text-emerald-700"}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</span>
                        </div>
                        <p className="text-slate-600">{movement.product.itemCode} - {movement.product.name}</p>
                        <p className="text-slate-500">{movement.location ? `${movement.location.name} (${movement.location.code})` : "No stock location"} · {movement.actor} · {new Date(movement.occurredAt).toLocaleString()}</p>
                      </div>
                    )) : (
                      <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">No inventory movements posted yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Reference</th>
                  <th className="p-3 text-left">Destination</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Products</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {transfers.isLoading ? (
                  <tr><td className="p-6" colSpan={5}>Loading transfers...</td></tr>
                ) : transfers.data?.length ? (
                  transfers.data.map((transfer) => (
                    <tr className="border-t" key={transfer.id}>
                      <td className="p-3 font-medium">{transfer.reference}</td>
                      <td className="p-3">{transfer.destination.name} ({transfer.destination.code})</td>
                      <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{transfer.status}</Badge></td>
                      <td className="p-3">{transfer.lines.length}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => selectTransfer(transfer)}
                          >
                            {selected?.id === transfer.id ? "Hide details" : "View details"}
                          </Button>
                          {transfer.status === "DRAFT" && role === "STOCK_STAFF" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={deleteDraftMutation.isPending}
                              onClick={() => deleteDraftMutation.mutate({ transferId: transfer.id })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td className="p-6 text-slate-500" colSpan={5}>No transfers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
