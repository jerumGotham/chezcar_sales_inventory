"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import Select from "react-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  PackageCheck,
  Warehouse,
  Building2,
  MapPin,
  Truck,
} from "lucide-react";

import { LocationScopeControl, parseScopeValue } from "@/components/location-scope-control";
import { PageShell } from "@/components/page-shell";
import { TablePagination } from "@/components/table-pagination";
import { useCan } from "@/components/shell-access-context";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { correctInventory, fetchInventory, fetchInventoryMovements, updateInventoryUnitCost } from "@/lib/catalog";
import type { LocationScopeDto } from "@/lib/contracts/access";
import { fetchInventoryAvailability } from "@/lib/inventory-availability";

import {
  ADJUSTMENT_TYPE_OPTIONS,
  CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
  MOVEMENT_TYPE_OPTIONS,
  PRODUCT_OPTIONS,
  STATUS_OPTIONS,
  getAvailableStock,
  getGroupedStatus,
  getStockBadgeClass,
  formatPeso,
  reactSelectStyles,
  type InventoryRow,
  type ProductGroupRow,
  type SelectOption,
} from "./_data";

export type InventoryLocationOption = {
  id: string;
  code: string;
  name: string;
};

export type InventoryClientProps = {
  scope: LocationScopeDto;
  locations: readonly InventoryLocationOption[];
  initialBalanceId?: string;
  /** Location code preselected by a notification link. */
  initialLocationCode?: string;
};

const ALL_LOCATIONS_VALUE = "all";
const ALL_BRANDS_OPTION: SelectOption = { value: "all", label: "All Brands" };
const numberFormatter = new Intl.NumberFormat("en-PH");

function locationLabel(location: InventoryLocationOption): string {
  return `${location.name} (${location.code})`;
}

export function InventoryClient({
  scope,
  locations,
  initialBalanceId,
  initialLocationCode,
}: InventoryClientProps) {
  const queryClient = useQueryClient();
  const canSelectLocations = scope.kind !== "location";
  const canReceiveSupplierStock = useCan("inventory-receiving:create");
  const canAdjustStock = useCan("inventory:adjust");
  const canUpdateCost = useCan("inventory:cost:update");
  const canViewMovements = useCan("inventory-movements:view");
  const canViewAvailability = useCan("inventory-availability:view");
  const canViewStockTransfers = useCan("stock-transfers:view");

  // Applied location starts from the server-derived scope DTO and can never
  // exceed it: only Admin may request anything besides All locations.
  const scopedLocationValue =
    scope.kind === "location" && scope.code
      ? scope.code
      : ALL_LOCATIONS_VALUE;

  const locationOptions: SelectOption[] = [
    { value: ALL_LOCATIONS_VALUE, label: "All locations" },
    ...locations.map((item) => ({
      value: item.code,
      label: locationLabel(item),
    })),
  ];

  const optionForValue = (value: string): SelectOption =>
    locationOptions.find((option) => option.value === value) ??
    locationOptions[0];

  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [brand, setBrand] = useState<SelectOption>(ALL_BRANDS_OPTION);
  const initialLocationValue =
    canSelectLocations && initialLocationCode &&
    locations.some((item) => item.code === initialLocationCode)
      ? initialLocationCode
      : scopedLocationValue;
  // Held as the raw scope value ("all", or comma-separated branch codes) so a
  // pick of several branches survives; a single option could not carry it.
  const [location, setLocation] = useState<string>(initialLocationValue);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedItemCode, setAppliedItemCode] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [appliedDescription, setAppliedDescription] = useState("");
  const [appliedVehicleModel, setAppliedVehicleModel] = useState("all");
  const [appliedVehicleYear, setAppliedVehicleYear] = useState<string | number>("all");
  const [appliedBrand, setAppliedBrand] = useState("all");
  const [appliedLocation, setAppliedLocation] =
    useState(initialLocationValue);
  const [appliedStatus, setAppliedStatus] = useState("all");

  const summaryScopeLabel = canSelectLocations
    ? appliedLocation === ALL_LOCATIONS_VALUE
      ? "all locations"
      : parseScopeValue(appliedLocation)
          .map((code) => optionForValue(code).label)
          .join(", ")
    : scope.label;

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [expandedProducts, setExpandedProducts] = useState<
    Record<string, boolean>
  >({});

  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isQuickAdjustOpen, setIsQuickAdjustOpen] = useState(false);
  const [isCostOpen, setIsCostOpen] = useState(false);
  const [isStockCardOpen, setIsStockCardOpen] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  const [adjustProduct, setAdjustProduct] = useState<SelectOption | null>(null);
  const [adjustType, setAdjustType] = useState<SelectOption | null>(
    ADJUSTMENT_TYPE_OPTIONS[0],
  );

  const [quickAdjustType, setQuickAdjustType] = useState<SelectOption | null>(
    ADJUSTMENT_TYPE_OPTIONS[0],
  );
  const [adjustQuantity, setAdjustQuantity] = useState("");
  const [adjustReference, setAdjustReference] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustRemarks, setAdjustRemarks] = useState("");
  const [quickAdjustQuantity, setQuickAdjustQuantity] = useState("");
  const [quickAdjustReference, setQuickAdjustReference] = useState("");
  const [quickAdjustReason, setQuickAdjustReason] = useState("");
  const [quickAdjustRemarks, setQuickAdjustRemarks] = useState("");
  const [costBalance, setCostBalance] = useState<InventoryRow | null>(null);
  const [newUnitCost, setNewUnitCost] = useState("");
  const [costReference, setCostReference] = useState("");
  const [costReason, setCostReason] = useState("");
  const [costRemarks, setCostRemarks] = useState("");
  const [mutationError, setMutationError] = useState("");
  // Both mutations just closed their modal, so an adjustment that applied
  // looked the same as one that silently did nothing.
  const [mutationNotice, setMutationNotice] = useState("");

  const [stockCardProductFilter, setStockCardProductFilter] =
    useState<SelectOption>({
      value: "all",
      label: "All Products",
    });
  const [stockCardLocationFilter, setStockCardLocationFilter] =
    useState<SelectOption>(LOCATION_OPTIONS[0]);
  const [stockCardMovementTypeFilter, setStockCardMovementTypeFilter] =
    useState<SelectOption>(MOVEMENT_TYPE_OPTIONS[0]);
  const [stockCardReference, setStockCardReference] = useState("");

  const [availabilityProductFilter, setAvailabilityProductFilter] =
    useState<SelectOption>({
      value: "all",
      label: "All Products",
    });
  const [availabilityCategoryFilter, setAvailabilityCategoryFilter] =
    useState<SelectOption>(CATEGORY_OPTIONS[0]);
  const [availabilityLocationFilter, setAvailabilityLocationFilter] =
    useState<SelectOption>({ value: "all", label: "All locations" });
  const [availabilityStatusFilter, setAvailabilityStatusFilter] =
    useState<SelectOption>(STATUS_OPTIONS[0]);

  const { data, error, isLoading, isFetching } = useQuery({
    queryKey: [
      "inventory-locations",
      {
        page,
        pageSize,
        balanceId: initialBalanceId,
        itemCode: appliedItemCode,
        name: appliedName,
        description: appliedDescription,
        vehicleModel: appliedVehicleModel,
        vehicleYear: appliedVehicleYear,
        brand: appliedBrand,
        location: appliedLocation,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      fetchInventory({
        page,
        pageSize,
        ...(initialBalanceId ? { balanceId: initialBalanceId } : {}),
        itemCode: appliedItemCode,
        name: appliedName,
        description: appliedDescription,
        vehicleModel: appliedVehicleModel,
        vehicleYear: appliedVehicleYear,
        brand: appliedBrand,
        location: appliedLocation,
        status: appliedStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const { data: movementsData, isLoading: isMovementsLoading } = useQuery({
    queryKey: [
      "inventory-movements",
      {
        product: stockCardProductFilter.value,
        location: stockCardLocationFilter.value,
        type: stockCardMovementTypeFilter.value,
        reference: stockCardReference,
      },
    ],
    queryFn: () =>
      fetchInventoryMovements({
        page: 1,
        pageSize: 100,
        product: stockCardProductFilter.value,
        location: stockCardLocationFilter.value,
        type: stockCardMovementTypeFilter.value,
        reference: stockCardReference,
      }),
    enabled: canViewMovements && isStockCardOpen,
  });

  const {
    data: availabilityData,
    error: availabilityError,
    isLoading: isAvailabilityLoading,
  } = useQuery({
    queryKey: [
      "inventory-availability",
      {
        product: availabilityProductFilter.value,
        category: availabilityCategoryFilter.value,
        location: availabilityLocationFilter.value,
        status: availabilityStatusFilter.value,
      },
    ],
    queryFn: () =>
      fetchInventoryAvailability({
        product: availabilityProductFilter.value,
        category: availabilityCategoryFilter.value,
        location: availabilityLocationFilter.value,
        status: availabilityStatusFilter.value,
      }),
    enabled: canViewAvailability && isAvailabilityOpen,
    placeholderData: (previousData) => previousData,
  });

  const refreshInventory = () => {
    void queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
  };

  const correctionMutation = useMutation({
    mutationFn: (payload: {
      balanceId: string;
      type: "increase" | "decrease";
      quantity: number;
       reference?: string;
      reason: string;
      remarks?: string;
    }) => {
      if (!canAdjustStock) throw new Error("You do not have permission to adjust stock.");
      return correctInventory(payload.balanceId, payload);
    },
    onSuccess: (_, payload) => {
      refreshInventory();
      setIsAdjustOpen(false);
      setIsQuickAdjustOpen(false);
      resetAdjustmentFields();
      setMutationNotice(`Stock ${payload.type === "increase" ? "increased" : "decreased"} by ${payload.quantity}.`);
    },
    onError: (saveError) => { setMutationNotice(""); setMutationError(saveError.message); },
  });

  const flatRows = useMemo(() => data?.data ?? [], [data?.data]);
  const brandOptions = useMemo(() => [
    ALL_BRANDS_OPTION,
    ...(data?.filterOptions.brands ?? []).map((supplier) => ({ value: supplier.id, label: supplier.name })),
  ], [data?.filterOptions.brands]);
  const balanceOptions: SelectOption[] = flatRows.map((item) => ({
    value: item.id,
    label: `${item.itemCode} - ${item.name} (${item.location})`,
  }));
  const selectedAdjustBalance = flatRows.find((item) => item.id === adjustProduct?.value) ?? null;
  const meta = useMemo(
    () => data?.meta ?? {
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
    },
    [data?.meta, pageSize],
  );
  const summary = data?.summary ?? {
    totalProducts: 0,
    totalUnits: 0,
    needsRestock: 0,
    incomingItems: 0,
    incomingItemsLabel: "Incoming items",
  };

  const groupedRows = useMemo<ProductGroupRow[]>(() => {
    const map = new Map<string, InventoryRow[]>();

    flatRows.forEach((row) => {
      const list = map.get(row.itemCode) ?? [];
      list.push(row);
      map.set(row.itemCode, list);
    });

    return Array.from(map.entries()).map(([itemCode, rows]) => {
      const first = rows[0];
      const totalOnHand = rows.reduce((sum, row) => sum + row.onHand, 0);
      const totalReserved = rows.reduce((sum, row) => sum + row.reserved, 0);
      const totalQuarantined = rows.reduce((sum, row) => sum + row.quarantined, 0);
      const totalAvailable = rows.reduce(
        (sum, row) => sum + getAvailableStock(row),
        0,
      );

      const latestUpdated = rows
        .map((row) => row.lastUpdated)
        .sort()
        .slice(-1)[0];

      return {
        itemCode,
        name: first.name,
        category: first.category,
        totalOnHand,
        totalReserved,
        totalQuarantined,
        totalAvailable,
        reorderLevel: first.reorderLevel,
        unitCost: first.unitCost,
        locations: rows,
        status: getGroupedStatus(rows),
        lastUpdated: latestUpdated,
      };
    });
  }, [flatRows]);

  const stockCardRows = movementsData?.data ?? [];

  const availabilityRows = availabilityData?.data ?? [];
  const availabilityProductOptions: SelectOption[] = [
    { value: "all", label: "All Products" },
    ...(availabilityData?.filterOptions.products ?? []).map((product) => ({
      value: product.id,
      label: `${product.itemCode} - ${product.name}`,
    })),
  ];
  const availabilityCategoryOptions: SelectOption[] = [
    { value: "all", label: "All Categories" },
    ...(availabilityData?.filterOptions.categories ?? []).map((category) => ({
      value: category,
      label: category,
    })),
  ];
  const availabilityLocationOptions: SelectOption[] = [
    { value: "all", label: "All locations" },
    ...(availabilityData?.filterOptions.locations ?? []).map((item) => ({
      value: item.id,
      label: `${item.name} (${item.code})`,
    })),
  ];

  const showingFrom = useMemo(() => {
    if (meta.total === 0) return 0;
    return (meta.page - 1) * meta.pageSize + 1;
  }, [meta]);

  const showingTo = useMemo(() => {
    if (meta.total === 0) return 0;
    return Math.min(meta.page * meta.pageSize, meta.total);
  }, [meta]);

  // The PDF copy follows the applied filters and covers every matching row,
  // not just the page on screen.
  const exportParams = useMemo(() => {
    const params = new URLSearchParams({ format: "pdf" });
    if (initialBalanceId) params.set("balanceId", initialBalanceId);
    if (appliedItemCode) params.set("itemCode", appliedItemCode);
    if (appliedName) params.set("name", appliedName);
    if (appliedDescription) params.set("description", appliedDescription);
    if (appliedVehicleModel !== "all") params.set("vehicleModel", appliedVehicleModel);
    if (appliedVehicleYear !== "all") params.set("vehicleYear", String(appliedVehicleYear));
    if (appliedBrand !== "all") params.set("brand", appliedBrand);
    if (appliedLocation !== ALL_LOCATIONS_VALUE) params.set("location", appliedLocation);
    if (appliedStatus !== "all") params.set("status", appliedStatus);
    return params.toString();
  }, [initialBalanceId, appliedItemCode, appliedName, appliedDescription, appliedVehicleModel, appliedVehicleYear, appliedBrand, appliedLocation, appliedStatus]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedItemCode(itemCode);
    setAppliedName(name);
    setAppliedDescription(description.trim());
    setAppliedVehicleModel(vehicleModel.trim() || "all");
    setAppliedVehicleYear(vehicleYear.trim() ? Number(vehicleYear) : "all");
    setAppliedBrand(brand.value);
    setAppliedLocation(canSelectLocations ? location : scopedLocationValue);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setItemCode("");
    setName("");
    setDescription("");
    setVehicleModel("");
    setVehicleYear("");
    setBrand(ALL_BRANDS_OPTION);
    setLocation(scopedLocationValue);
    setStatus(STATUS_OPTIONS[0]);
    setAppliedItemCode("");
    setAppliedName("");
    setAppliedDescription("");
    setAppliedVehicleModel("all");
    setAppliedVehicleYear("all");
    setAppliedBrand("all");
    setAppliedLocation(scopedLocationValue);
    setAppliedStatus("all");
    setPage(1);
  };

  const toggleExpanded = (itemCodeKey: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [itemCodeKey]: !prev[itemCodeKey],
    }));
  };

  const openAdjustModal = () => {
    setAdjustProduct(null);
    setAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
    resetAdjustmentFields();
    setIsAdjustOpen(true);
  };

  const openQuickAdjustModal = (item: InventoryRow) => {
    setSelectedItem(item);
    setQuickAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
    resetAdjustmentFields();
    setIsQuickAdjustOpen(true);
  };

  function resetAdjustmentFields() {
    setAdjustQuantity("");
    setAdjustReference("");
    setAdjustReason("");
    setAdjustRemarks("");
    setQuickAdjustQuantity("");
    setQuickAdjustReference("");
    setQuickAdjustReason("");
    setQuickAdjustRemarks("");
    setMutationError("");
    setMutationNotice("");
  }

  const submitQuickAdjustment = () => {
    if (!canAdjustStock || !selectedItem || !quickAdjustType) return;
    correctionMutation.mutate({
      balanceId: selectedItem.id,
      type: quickAdjustType.value === "decrease" ? "decrease" : "increase",
      quantity: Number(quickAdjustQuantity || 0),
       reference: quickAdjustReference,
      reason: quickAdjustReason,
      remarks: quickAdjustRemarks,
    });
  };

  const submitAdjustment = () => {
    if (!canAdjustStock || !adjustProduct || !adjustType) return;
    correctionMutation.mutate({
      balanceId: adjustProduct.value,
      type: adjustType.value === "decrease" ? "decrease" : "increase",
      quantity: Number(adjustQuantity || 0),
       reference: adjustReference,
      reason: adjustReason,
      remarks: adjustRemarks,
    });
  };

  const openCostModal = (item: InventoryRow) => {
    setCostBalance(item);
    setNewUnitCost(String(item.unitCost));
    setCostReference("");
    setCostReason("");
    setCostRemarks("");
    setMutationError("");
    setMutationNotice("");
    setIsCostOpen(true);
  };

  const costMutation = useMutation({
    mutationFn: () => {
      if (!canUpdateCost) throw new Error("You do not have permission to edit inventory cost.");
      if (!costBalance) throw new Error("Select an inventory balance first.");
      return updateInventoryUnitCost(costBalance.id, {
        unitCost: Number(newUnitCost),
        reference: costReference,
        reason: costReason,
        remarks: costRemarks,
      });
    },
    onSuccess: () => {
      refreshInventory();
      setIsCostOpen(false);
      setCostBalance(null);
      setMutationNotice("Unit cost updated.");
    },
    onError: (saveError) => { setMutationNotice(""); setMutationError(saveError.message); },
  });

  return (
    <>
      <PageShell
        title="Inventory"
        subtitle={`Live stock levels for ${summaryScopeLabel}. Data comes from the database and survives reload.`}
      >
        {mutationNotice ? (
          <p role="status" className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm text-emerald-800 dark:text-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {mutationNotice}
          </p>
        ) : null}
        <p className="mb-4 text-sm text-muted-foreground">
          Showing totals for <span className="font-semibold text-foreground">{summaryScopeLabel}</span> only.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Total Stocks</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {numberFormatter.format(summary.totalUnits)}
                </h3>
                <p className="mt-2 text-sm text-sky-600">
                  Actual pieces currently in stock
                </p>
              </div>
              <div className="rounded-full bg-sky-50 dark:bg-sky-950/40 p-2">
                <PackageCheck className="h-5 w-5 text-sky-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">Need Restock</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {numberFormatter.format(summary.needsRestock)}
                </h3>
                <p className="mt-2 text-sm text-red-600">
                  Product locations that are low or out of stock
                </p>
              </div>
              <div className="rounded-full bg-red-50 dark:bg-red-950/40 p-2">
                <Warehouse className="h-5 w-5 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">
                  {summary.incomingItemsLabel}
                </p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {numberFormatter.format(summary.incomingItems)}
                </h3>
                <p className="mt-2 text-sm text-violet-600">
                  Awaiting branch receipt or resolution
                </p>
              </div>
              <div className="rounded-full bg-violet-50 dark:bg-violet-950/40 p-2">
                <Truck className="h-5 w-5 text-violet-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* A plain card. The violet tint fought the buttons it holds, and its
            title was near-black violet with no dark counterpart, so on a dark
            page it disappeared into its own background. */}
        <Card className="mt-6">
          <CardContent className="flex flex-col gap-4 p-5">
            <div>
              <p className="font-semibold text-foreground">Stock Transfers</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canReceiveSupplierStock
                  ? "Create and dispatch Stock Room transfers separately from receiving."
                  : "Review transfer work separately from inventory counts."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canReceiveSupplierStock && <Link href="/inventory/receive" className={buttonVariants()}>Receive from Supplier</Link>}
              {canAdjustStock && <Button variant="warning" onClick={openAdjustModal}>Adjust Stock</Button>}
              {/* Three reads sat side by side in one blue; the shade now tells
                  history from current stock from the module this leaves for. */}
              {canViewMovements && <Button variant="workflow" onClick={() => setIsStockCardOpen(true)}>Stock Movement</Button>}
              {canViewAvailability && <Button variant="view" onClick={() => setIsAvailabilityOpen(true)}>Inventory Availability</Button>}
              {canViewStockTransfers && <Link href="/stock-transfers" className={buttonVariants({ variant: "teal" })}>Open Stock Transfers</Link>}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
            <Input
              placeholder="Item Code"
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
            />

            <Input
              placeholder="Search item name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Input
              placeholder="Search description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Input
              placeholder="Car model"
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
            />

            <Input
              type="number"
              min="1886"
              max="2200"
              placeholder="Vehicle year"
              value={vehicleYear}
              onChange={(e) => setVehicleYear(e.target.value)}
            />

            <div className="w-full">
              <Select
                instanceId="inventory-brand-filter"
                options={brandOptions}
                value={brand}
                onChange={(option) => setBrand(option ?? ALL_BRANDS_OPTION)}
                isSearchable
                placeholder="Select brand"
                styles={reactSelectStyles}
              />
            </div>

            <div className="w-full">
              <LocationScopeControl
                id="inventory-location-filter"
                scope={scope}
                locations={locations}
                value={location}
                onValueChange={setLocation}
              />
            </div>

            <div className="w-full">
              <Select
                instanceId="inventory-status-filter"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(option) => setStatus(option ?? STATUS_OPTIONS[0])}
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleApplyFilters}
              >
                Apply
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
                  Inventory by Product
                </h3>
                <p className="text-sm text-muted-foreground">
                  Showing {showingFrom} to {showingTo} of {meta.total} products
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1">
                <a
                  href={`/api/inventory?${exportParams}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <FileText aria-hidden="true" />
                  Export PDF
                </a>
                <p className="text-xs text-muted-foreground">
                  Exports every row matching the applied filters.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-b px-5 py-3">
              <TablePagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} busy={isFetching} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1500px]">
                <thead className="bg-muted">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Product
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total On Hand
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Reserved
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Quarantined</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Available
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Reorder Level
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Unit Cost
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Branches
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Expand
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="px-5 py-16 text-center">
                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading inventory...
                        </div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-5 py-16 text-center text-red-600"
                      >
                        {error.message}
                      </td>
                    </tr>
                  ) : groupedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-5 py-16 text-center text-muted-foreground"
                      >
                        No inventory records found.
                      </td>
                    </tr>
                  ) : (
                    groupedRows.map((group) => {
                      const containsLinkedBalance = group.locations.some(
                        (item) => item.id === initialBalanceId,
                      );
                      const isExpanded =
                        containsLinkedBalance || !!expandedProducts[group.itemCode];
                      const stockedLocations = group.locations.filter(
                        (item) => item.onHand > 0,
                      );
                      const visibleLocations = canSelectLocations
                        ? group.locations
                        : stockedLocations;
                      const emptyLocationCount = group.locations.length - stockedLocations.length;

                      return (
                        <React.Fragment key={group.itemCode}>
                          <tr
                            className={`border-b bg-card transition-colors hover:bg-muted ${containsLinkedBalance ? "ring-2 ring-inset ring-amber-400" : ""}`}
                          >
                            <td className="px-5 py-4">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {group.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {group.itemCode} • Last updated:{" "}
                                  {group.lastUpdated}
                                </p>
                              </div>
                            </td>

                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {group.category}
                            </td>

                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {group.totalOnHand}
                            </td>

                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {group.totalReserved}
                            </td>
                            <td className="px-5 py-4 text-sm text-amber-700 dark:text-amber-300">{group.totalQuarantined}</td>

                            <td className="px-5 py-4 text-sm font-semibold text-foreground">
                              {group.totalAvailable}
                            </td>

                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {group.reorderLevel}
                            </td>

                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {formatPeso(group.unitCost)}
                            </td>

                            {/* A bare count told nobody where the stock was, and
                                the answer was one expand away. */}
                            <td className="px-5 py-4 text-sm text-muted-foreground">
                              {stockedLocations.length ? (
                                <span className="block max-w-56 text-xs leading-relaxed">
                                  {stockedLocations.map((item) => item.location).join(", ")}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">No stock</span>
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm">
                              <Badge
                                className={getStockBadgeClass(group.status)}
                              >
                                {group.status}
                              </Badge>
                            </td>

                            <td className="px-5 py-4">
                               <div className="flex flex-wrap gap-2">
                                 <Button
                                   variant="view"
                                   size="sm"
                                   onClick={() => toggleExpanded(group.itemCode)}
                                 >
                                   {isExpanded ? (
                                     <>
                                       <ChevronUp className="mr-1 h-4 w-4" />
                                       Hide
                                     </>
                                   ) : (
                                     <>
                                       <ChevronDown className="mr-1 h-4 w-4" />
                                       View
                                     </>
                                   )}
                                 </Button>
                                  {canUpdateCost && group.locations[0] && (
                                   <Button variant="edit" size="sm" onClick={() => openCostModal(group.locations[0])}>
                                     Edit Cost
                                   </Button>
                                 )}
                               </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={11} className="bg-muted p-0">
                                <div className="p-5">
                                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="font-semibold text-foreground">
                                        Where this product is available
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {canSelectLocations
                                          ? "Admin can review and edit each location's reorder level."
                                          : "Only locations with stock are shown."}
                                      </p>
                                    </div>
                                    {emptyLocationCount > 0 && (
                                      <p className="text-sm text-muted-foreground">
                                        {emptyLocationCount} location
                                        {emptyLocationCount === 1 ? " has" : "s have"} no stock.
                                      </p>
                                    )}
                                  </div>

                                   {visibleLocations.length === 0 ? (
                                     <div className="mt-4 rounded-xl border border-dashed bg-card px-5 py-6 text-sm text-muted-foreground">
                                       This product has no stock in any location yet.
                                     </div>
                                   ) : (
                                     <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                       {visibleLocations.map((item) => {
                                        const isStockRoom =
                                          item.location === "Stock Room";
                                        const available = getAvailableStock(item);

                                          const isLinkedBalance =
                                            item.id === initialBalanceId;

                                          return (
                                           <div
                                             key={item.id}
                                             className={`rounded-xl border bg-card p-4 ${isLinkedBalance ? "border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900" : ""}`}
                                           >
                                            <div className="flex items-start justify-between gap-3">
                                              <div className="flex items-center gap-2 font-semibold text-foreground">
                                                {isStockRoom ? (
                                                  <Warehouse className="h-4 w-4 text-sky-600" />
                                                ) : (
                                                  <Building2 className="h-4 w-4 text-violet-600" />
                                                )}
                                                {item.location}
                                              </div>
                                               <Badge className={getStockBadgeClass(item.status)}>
                                                 {item.status}
                                               </Badge>
                                             </div>
                                             {isLinkedBalance && (
                                               <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                                 Linked inventory alert
                                               </p>
                                             )}
                                            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3">
                                              <div>
                                                <p className="text-xs text-muted-foreground">On hand</p>
                                                <p className="text-lg font-semibold text-foreground">
                                                  {item.onHand} pieces
                                                </p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-muted-foreground">Quarantined</p>
                                                <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">{item.quarantined} pieces</p>
                                              </div>
                                              <div>
                                                <p className="text-xs text-muted-foreground">Ready to sell</p>
                                                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                                                  {available} pieces
                                                </p>
                                              </div>
                                            </div>
                                            {canAdjustStock && (
                                              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                                                <Button
                                                  variant="warning"
                                                  size="sm"
                                                  onClick={() => openQuickAdjustModal(item)}
                                                >
                                                  Quick Adjust
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>
      </PageShell>

      <Dialog
        open={isAdjustOpen}
        onOpenChange={(open) => {
          setIsAdjustOpen(open);
          if (!open) {
            setAdjustProduct(null);
            setAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              Manual adjustment for corrections only. Normal stock movement
              should come from Receive Stock, Transfer, POS, Job Order, Customer
              Order, and Stock Transfer.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Inventory Balance</Label>
                <Select
                  instanceId="adjust-product"
                  options={balanceOptions}
                  value={adjustProduct}
                  onChange={(option) => setAdjustProduct(option)}
                  isSearchable
                  placeholder="Select product and location from current results"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={selectedAdjustBalance?.location ?? "Select an inventory balance first"} disabled />
              </div>

              <div className="space-y-2">
                <Label>Adjustment Type</Label>
                <Select
                  instanceId="adjust-type"
                  options={ADJUSTMENT_TYPE_OPTIONS}
                  value={adjustType}
                  onChange={(option) => setAdjustType(option)}
                  isSearchable={false}
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-qty">Quantity Change</Label>
                <Input id="adjustment-qty" type="number" min="0" placeholder="0" value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-reference">Reference No.</Label>
                <Input id="adjustment-reference" placeholder="ADJ-000123" value={adjustReference} onChange={(event) => setAdjustReference(event.target.value)} />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="adjustment-reason">Reason</Label>
                <Input
                  id="adjustment-reason"
                  placeholder="Damaged item, recount correction, missing stock, found stock, expired item, etc."
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="adjustment-remarks">Remarks</Label>
                <Input
                  id="adjustment-remarks"
                  placeholder="Additional notes for this stock adjustment"
                  value={adjustRemarks}
                  onChange={(event) => setAdjustRemarks(event.target.value)}
                />
              </div>
            </div>

            {mutationError && <p className="text-sm font-medium text-red-600">{mutationError}</p>}

            <div className="rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Use stock adjustment only when the actual physical count does not
              match the system.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="warning"
              onClick={submitAdjustment}
               disabled={correctionMutation.isPending || !adjustProduct || !adjustReason.trim() || Number(adjustQuantity || 0) <= 0}
            >
              {correctionMutation.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isQuickAdjustOpen}
        onOpenChange={(open) => {
          setIsQuickAdjustOpen(open);
          if (!open) {
            setSelectedItem(null);
            setQuickAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Quick Adjust</DialogTitle>
            <DialogDescription>
              Quick correction for the selected inventory row only.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Input
                  value={
                    selectedItem
                      ? `${selectedItem.itemCode} - ${selectedItem.name}`
                      : ""
                  }
                  disabled
                />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={selectedItem?.location ?? ""} disabled />
              </div>

              <div className="space-y-2">
                <Label>Adjustment Type</Label>
                <Select
                  instanceId="quick-adjust-type"
                  options={ADJUSTMENT_TYPE_OPTIONS}
                  value={quickAdjustType}
                  onChange={(option) => setQuickAdjustType(option)}
                  isSearchable={false}
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-qty">Quantity Change</Label>
                <Input id="quick-adjust-qty" type="number" min="0" placeholder="0" value={quickAdjustQuantity} onChange={(event) => setQuickAdjustQuantity(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-reference">Reference No.</Label>
                <Input id="quick-adjust-reference" placeholder="ADJ-000124" value={quickAdjustReference} onChange={(event) => setQuickAdjustReference(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-reason">Reason</Label>
                <Input
                  id="quick-adjust-reason"
                  placeholder="Wrong encoding, recount mismatch, damaged, etc."
                  value={quickAdjustReason}
                  onChange={(event) => setQuickAdjustReason(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-remarks">Remarks</Label>
                <Input
                  id="quick-adjust-remarks"
                  placeholder="Additional notes"
                  value={quickAdjustRemarks}
                  onChange={(event) => setQuickAdjustRemarks(event.target.value)}
                />
              </div>
            </div>

            {mutationError && <p className="text-sm font-medium text-red-600">{mutationError}</p>}

            <div className="rounded-xl border border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              Product and location are locked because this quick adjust only
              applies to the selected row.
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsQuickAdjustOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="warning"
              onClick={submitQuickAdjustment}
               disabled={correctionMutation.isPending || !quickAdjustReason.trim() || Number(quickAdjustQuantity || 0) <= 0}
            >
              {correctionMutation.isPending ? "Saving..." : "Save Quick Adjust"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCostOpen}
        onOpenChange={(open) => {
          setIsCostOpen(open);
          if (!open) {
            setCostBalance(null);
            setMutationError("");
    setMutationNotice("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Unit Cost</DialogTitle>
            <DialogDescription>
              Update the costing basis for one product and location. This does not change stock quantity.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Inventory Balance</Label>
              <Select
                instanceId="cost-balance"
                options={balanceOptions}
                value={costBalance ? { value: costBalance.id, label: `${costBalance.itemCode} - ${costBalance.name} (${costBalance.location})` } : null}
                onChange={(option) => {
                  const balance = flatRows.find((item) => item.id === option?.value) ?? null;
                  setCostBalance(balance);
                  if (balance) setNewUnitCost(String(balance.unitCost));
                }}
                isSearchable
                placeholder="Select product and location"
                styles={reactSelectStyles}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-unit-cost">New Unit Cost</Label>
              <Input id="new-unit-cost" type="number" min="0.01" step="0.01" value={newUnitCost} onChange={(event) => setNewUnitCost(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-reference">Reference No. (optional)</Label>
              <Input id="cost-reference" value={costReference} onChange={(event) => setCostReference(event.target.value)} placeholder="COST-000123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-reason">Reason</Label>
              <Input id="cost-reason" value={costReason} onChange={(event) => setCostReason(event.target.value)} placeholder="Supplier price update, encoding correction, etc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-remarks">Remarks (optional)</Label>
              <Input id="cost-remarks" value={costRemarks} onChange={(event) => setCostRemarks(event.target.value)} placeholder="Additional notes" />
            </div>
            {mutationError && <p className="text-sm font-medium text-red-600">{mutationError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCostOpen(false)}>Cancel</Button>
            <Button
              variant="edit"
              onClick={() => costMutation.mutate()}
              disabled={costMutation.isPending || !costBalance || Number(newUnitCost) <= 0 || !costReason.trim()}
            >
              {costMutation.isPending ? "Saving..." : "Save Cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Sheet open={isStockCardOpen} onOpenChange={setIsStockCardOpen}>
        <SheetContent
          side="right"
          className="
      !w-[100vw]
      !max-w-[100vw]
      sm:!max-w-[95vw]
      lg:!max-w-[88vw]
      xl:!max-w-[80vw]
      2xl:!max-w-[72vw]
      h-screen
      overflow-hidden
      p-2
    "
        >
          <SheetHeader>
            <SheetTitle>Stock Movement</SheetTitle>
            <SheetDescription>
              Global stock movement history with filters for product, location,
              movement type, and reference number.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select
                instanceId="stockcard-product-filter"
                options={[
                  { value: "all", label: "All Products" },
                  ...PRODUCT_OPTIONS,
                ]}
                value={stockCardProductFilter}
                onChange={(option) =>
                  setStockCardProductFilter(
                    option ?? { value: "all", label: "All Products" },
                  )
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                instanceId="stockcard-location-filter"
                options={locationOptions}
                value={stockCardLocationFilter}
                onChange={(option) =>
                  setStockCardLocationFilter(option ?? locationOptions[0])
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Movement Type</Label>
              <Select
                instanceId="stockcard-movement-filter"
                options={MOVEMENT_TYPE_OPTIONS}
                value={stockCardMovementTypeFilter}
                onChange={(option) =>
                  setStockCardMovementTypeFilter(
                    option ?? MOVEMENT_TYPE_OPTIONS[0],
                  )
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stockcard-reference-filter">Reference No.</Label>
              <Input
                id="stockcard-reference-filter"
                placeholder="Search reference"
                value={stockCardReference}
                onChange={(e) => setStockCardReference(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-muted">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Movement Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Remarks
                  </th>
                </tr>
              </thead>

              <tbody>
                {isMovementsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      Loading stock movement records...
                    </td>
                  </tr>
                ) : stockCardRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      No stock card records found.
                    </td>
                  </tr>
                ) : (
                  stockCardRows.map((movement) => (
                    <tr
                      key={movement.id}
                      className="border-b hover:bg-muted"
                    >
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {movement.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>
                          <p className="font-medium">{movement.itemName}</p>
                          <p className="text-xs text-muted-foreground">
                            {movement.itemCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        {movement.type}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-medium ${
                          movement.qty >= 0
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {movement.qty > 0 ? `+${movement.qty}` : movement.qty}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {movement.reference}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {movement.location}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {movement.remarks}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={isAvailabilityOpen} onOpenChange={setIsAvailabilityOpen}>
        <SheetContent
          side="right"
          className="
      !w-[100vw]
      !max-w-[100vw]
      sm:!max-w-[95vw]
      lg:!max-w-[88vw]
      xl:!max-w-[80vw]
      2xl:!max-w-[72vw]
      h-screen
      overflow-hidden
      p-2
    "
        >
          <SheetHeader>
            <SheetTitle>Inventory Availability</SheetTitle>
            <SheetDescription>
              View current on-hand, reserved, and available stock by product and location.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select
                instanceId="availability-product-filter"
                options={availabilityProductOptions}
                value={availabilityProductFilter}
                onChange={(option) =>
                  setAvailabilityProductFilter(
                    option ?? { value: "all", label: "All Products" },
                  )
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                instanceId="availability-category-filter"
                options={availabilityCategoryOptions}
                value={availabilityCategoryFilter}
                onChange={(option) =>
                  setAvailabilityCategoryFilter(
                    option ?? { value: "all", label: "All Categories" },
                  )
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                instanceId="availability-location-filter"
                options={availabilityLocationOptions}
                value={availabilityLocationFilter}
                onChange={(option) =>
                  setAvailabilityLocationFilter(
                    option ?? { value: "all", label: "All locations" },
                  )
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                instanceId="availability-status-filter"
                options={STATUS_OPTIONS}
                value={availabilityStatusFilter}
                onChange={(option) =>
                  setAvailabilityStatusFilter(option ?? STATUS_OPTIONS[0])
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-muted">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    On Hand
                  </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Reserved
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quarantined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Available
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {isAvailabilityLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading inventory availability...
                      </span>
                    </td>
                  </tr>
                ) : availabilityError ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-red-600">
                      {availabilityError.message}
                    </td>
                  </tr>
                ) : availabilityRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      No availability records found.
                    </td>
                  </tr>
                ) : (
                  availabilityRows.map((row) => (
                    <tr
                      key={`${row.product.id}-${row.location.id}`}
                      className="border-b hover:bg-muted"
                    >
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div>
                          <p className="font-medium">{row.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.product.itemCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.product.category}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <div className="flex items-center gap-2">
                          {row.location.type === "WAREHOUSE" ? (
                            <Warehouse className="h-4 w-4 text-sky-600" />
                          ) : (
                            <MapPin className="h-4 w-4 text-violet-600" />
                          )}
                          {row.location.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.onHand}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.reserved}
                      </td>
                      <td className="px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{row.quarantined}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">
                        {row.available}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Badge className={getStockBadgeClass(row.status)}>
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
