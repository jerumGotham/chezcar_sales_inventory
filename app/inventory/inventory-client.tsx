"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
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
import { ZoomableImage } from "@/components/zoomable-image";
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
import { correctInventory, fetchInventory, fetchInventoryMovements } from "@/lib/catalog";
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

/**
 * One labelled catalogue value from the branch sheet.
 *
 * The label is carried on every value rather than once in a column header,
 * because a card has no header row and because a reader who does not recognise
 * "1003" needs to be told which of these is the code and which is the name.
 *
 * The grey belongs to the label and the weight to the value: the label is read
 * once to learn the layout, while the value is what someone came to find.
 */
function CatalogField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        // Long sheet text is clamped so one wordy description cannot push the
        // totals below it out of reach.
        className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground"
        title={value || undefined}
      >
        {/* An empty cell stays grey: a dash is the absence of a value, not one. */}
        {value || <span className="font-normal text-muted-foreground">&mdash;</span>}
      </dd>
    </div>
  );
}

function StockTotal({
  label,
  value,
  className = "text-foreground",
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-lg font-semibold ${className}`}>
        {numberFormatter.format(value)}
      </dd>
    </div>
  );
}

/**
 * The card's thumbnail, which opens the photo full size.
 *
 * A product with no photo is a plain panel rather than a dead button, so the
 * pointer never promises something to click that will not open.
 */
function ProductPhotoButton({
  imageUrl,
  name,
  onOpen,
}: {
  imageUrl: string | null;
  name: string;
  onOpen: () => void;
}) {
  if (!imageUrl) {
    return (
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted text-xs text-muted-foreground sm:h-32 sm:w-32">
        No photo
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open the photo of ${name}`}
      className="group relative h-28 w-28 shrink-0 cursor-zoom-in overflow-hidden rounded-xl border bg-muted sm:h-32 sm:w-32"
    >
      <Image
        src={imageUrl}
        alt={name}
        fill
        sizes="128px"
        // The route behind this checks the session, and the optimiser fetches
        // without one.
        unoptimized
        className="object-cover"
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        Click to open
      </span>
    </button>
  );
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

  // Tracks what is shut rather than what is open, so every row starts expanded:
  // the per-branch breakdown is the reason to be on this screen, and hiding it
  // behind a click each made the page look emptier than the stock it holds.
  const [collapsedProducts, setCollapsedProducts] = useState<
    Record<string, boolean>
  >({});

  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null);
  /** The product whose photo is open full size, or null when none is. */
  const [photoToView, setPhotoToView] = useState<ProductGroupRow | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isQuickAdjustOpen, setIsQuickAdjustOpen] = useState(false);
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

      return {
        itemCode,
        name: first.name,
        // Catalogue detail is the same on every balance of one product, so the
        // first row speaks for the group.
        description: first.description ?? "",
        brand: first.brand ?? "",
        carModel: first.carModel ?? "",
        yearModel: first.yearModel ?? "",
        imageUrl: first.imageUrl ?? null,
        category: first.category,
        totalOnHand,
        totalReserved,
        totalQuarantined,
        totalAvailable,
        reorderLevel: first.reorderLevel,
        unitCost: first.unitCost,
        locations: rows,
        status: getGroupedStatus(rows),
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
    setCollapsedProducts((prev) => ({
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
                  ? "Create and dispatch branch-to-branch transfers separately from receiving."
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
          <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
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

            <Input
              placeholder="Search description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                placeholder="Stock status"
                styles={reactSelectStyles}
              />
            </div>

            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4 xl:justify-end">
              <Button
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

            {/* Cards rather than a wide table: fourteen sheet columns could not
                be read side by side without a horizontal scroll, and a label
                beside each value matters more here than column alignment,
                because not everyone reading this recognises an item by code. */}
            <div className="space-y-4 p-4 sm:p-5">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading inventory...
                </div>
              ) : error ? (
                <p className="py-16 text-center text-red-600">{error.message}</p>
              ) : groupedRows.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">
                  No inventory records found.
                </p>
              ) : (
                groupedRows.map((group) => {
                  const containsLinkedBalance = group.locations.some(
                    (item) => item.id === initialBalanceId,
                  );
                  // A row reached from a notification link stays open even if
                  // the reader had shut it.
                  const isExpanded =
                    containsLinkedBalance || !collapsedProducts[group.itemCode];
                  const stockedLocations = group.locations.filter(
                    (item) => item.onHand > 0,
                  );
                  const visibleLocations = canSelectLocations
                    ? group.locations
                    : stockedLocations;
                  const emptyLocationCount =
                    group.locations.length - stockedLocations.length;

                  return (
                    <div
                      key={group.itemCode}
                      className={`overflow-hidden rounded-2xl border bg-card ${containsLinkedBalance ? "ring-2 ring-amber-400" : ""}`}
                    >
                      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:p-5">
                        <ProductPhotoButton
                          imageUrl={group.imageUrl}
                          name={group.name}
                          onOpen={() => setPhotoToView(group)}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                              {/* The order Products uses, so the two screens
                                  read the same way round: identity, then brand
                                  and fitment, and the long description last. */}
                              <CatalogField label="Item Code" value={group.itemCode} />
                              <CatalogField label="Name" value={group.name} />
                              <CatalogField label="Brand" value={group.brand} />
                              <CatalogField label="Car Model" value={group.carModel} />
                              <CatalogField label="Year Model" value={group.yearModel} />
                              <CatalogField label="Description" value={group.description} />
                            </dl>
                            <Badge className={getStockBadgeClass(group.status)}>
                              {group.status}
                            </Badge>
                          </div>

                          <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
                            <StockTotal label="Total On Hand" value={group.totalOnHand} />
                            <StockTotal label="Total Reserved" value={group.totalReserved} />
                            <StockTotal
                              label="Total Quarantined"
                              value={group.totalQuarantined}
                              className="text-amber-700 dark:text-amber-300"
                            />
                            <StockTotal
                              label="Total Available"
                              value={group.totalAvailable}
                              className="text-emerald-700 dark:text-emerald-300"
                            />
                          </dl>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            {/* Codes, not names: a product can sit in several
                                branches at once. */}
                            <p className="min-w-0 text-sm">
                              <span className="text-muted-foreground">Branches: </span>
                              {stockedLocations.length ? (
                                <span className="font-semibold text-foreground">
                                  {stockedLocations
                                    .map((item) => item.locationCode ?? item.location)
                                    .join(", ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">No stock</span>
                              )}
                            </p>
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
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t bg-muted p-4 sm:p-5">
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
                                const available = getAvailableStock(item);
                                const isLinkedBalance = item.id === initialBalanceId;

                                return (
                                  <div
                                    key={item.id}
                                    className={`rounded-xl border bg-card p-4 ${isLinkedBalance ? "border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900" : ""}`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-center gap-2 font-semibold text-foreground">
                                        <Building2 className="h-4 w-4 text-violet-600" />
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
                                        <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
                                          {item.quarantined} pieces
                                        </p>
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
                      )}
                    </div>
                  );
                })
              )}
            </div>

          </CardContent>
        </Card>
      </PageShell>

      <Dialog
        open={photoToView !== null}
        onOpenChange={(open) => {
          if (!open) setPhotoToView(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {photoToView?.imageUrl && (
            <>
              <DialogHeader>
                <DialogTitle>Product Photo</DialogTitle>
                {/* The code and the name are both named, because a photo alone
                    does not say which row it was opened from. */}
                <DialogDescription>
                  Item Code: {photoToView.itemCode} &middot; Name: {photoToView.name}
                </DialogDescription>
              </DialogHeader>
              <ZoomableImage src={photoToView.imageUrl} alt={photoToView.name} />
            </>
          )}
        </DialogContent>
      </Dialog>

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
