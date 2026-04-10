"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import Select from "react-select";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  PackageCheck,
  Warehouse,
  AlertTriangle,
  Boxes,
  Building2,
  MapPin,
  History,
  PackageSearch,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

import {
  ADJUSTMENT_TYPE_OPTIONS,
  CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
  MAIN_WAREHOUSE,
  MOCK_INVENTORY,
  MOCK_STOCK_MOVEMENTS,
  MOVEMENT_TYPE_OPTIONS,
  PRODUCT_OPTIONS,
  STATUS_OPTIONS,
  USER_ROLE,
  getAvailableStock,
  getGroupedStatus,
  getLocationBadgeClass,
  getStockBadgeClass,
  formatPeso,
  mockFetchInventory,
  reactSelectStyles,
  type BranchAvailabilityRow,
  type InventoryRow,
  type ProductGroupRow,
  type SelectOption,
} from "./_data";

export default function InventoryPage() {
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SelectOption>(CATEGORY_OPTIONS[0]);
  const [location, setLocation] = useState<SelectOption>(LOCATION_OPTIONS[0]);
  const [status, setStatus] = useState<SelectOption>(STATUS_OPTIONS[0]);

  const [appliedItemCode, setAppliedItemCode] = useState("");
  const [appliedName, setAppliedName] = useState("");
  const [appliedCategory, setAppliedCategory] = useState("all");
  const [appliedLocation, setAppliedLocation] = useState("all");
  const [appliedStatus, setAppliedStatus] = useState("all");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [expandedProducts, setExpandedProducts] = useState<
    Record<string, boolean>
  >({});

  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isQuickAdjustOpen, setIsQuickAdjustOpen] = useState(false);
  const [isStockCardOpen, setIsStockCardOpen] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  const [adjustProduct, setAdjustProduct] = useState<SelectOption | null>(null);
  const [adjustLocation, setAdjustLocation] = useState<SelectOption | null>(
    null,
  );
  const [adjustType, setAdjustType] = useState<SelectOption | null>(
    ADJUSTMENT_TYPE_OPTIONS[0],
  );

  const [quickAdjustType, setQuickAdjustType] = useState<SelectOption | null>(
    ADJUSTMENT_TYPE_OPTIONS[0],
  );

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
    useState<SelectOption>(LOCATION_OPTIONS[0]);
  const [availabilityStatusFilter, setAvailabilityStatusFilter] =
    useState<SelectOption>(STATUS_OPTIONS[0]);

  const canReceiveStock = USER_ROLE === "OWNER" || USER_ROLE === "ADMIN";
  const canTransferToBranch = USER_ROLE === "OWNER" || USER_ROLE === "ADMIN";
  const canAdjustStock = USER_ROLE === "OWNER" || USER_ROLE === "ADMIN";

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "inventory-locations",
      {
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        location: appliedLocation,
        status: appliedStatus,
      },
    ],
    queryFn: () =>
      mockFetchInventory({
        page,
        pageSize,
        itemCode: appliedItemCode,
        name: appliedName,
        category: appliedCategory,
        location: appliedLocation,
        status: appliedStatus,
      }),
    placeholderData: (previousData) => previousData,
  });

  const flatRows = data?.data ?? [];
  const meta = data?.meta ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
  const summary = data?.summary ?? {
    totalItems: 0,
    inStock: 0,
    lowStock: 0,
    outOfStock: 0,
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
        totalAvailable,
        reorderLevel: first.reorderLevel,
        unitCost: first.unitCost,
        locations: rows,
        status: getGroupedStatus(rows),
        lastUpdated: latestUpdated,
      };
    });
  }, [flatRows]);

  const stockCardRows = useMemo(() => {
    return MOCK_STOCK_MOVEMENTS.filter((movement) => {
      const byProduct =
        stockCardProductFilter.value === "all" ||
        movement.itemCode === stockCardProductFilter.value;
      const byLocation =
        stockCardLocationFilter.value === "all" ||
        movement.location === stockCardLocationFilter.value;
      const byMovementType =
        stockCardMovementTypeFilter.value === "all" ||
        movement.type === stockCardMovementTypeFilter.value;
      const byReference =
        !stockCardReference.trim() ||
        movement.reference
          .toLowerCase()
          .includes(stockCardReference.trim().toLowerCase());

      return byProduct && byLocation && byMovementType && byReference;
    });
  }, [
    stockCardProductFilter,
    stockCardLocationFilter,
    stockCardMovementTypeFilter,
    stockCardReference,
  ]);

  const availabilityRows = useMemo<BranchAvailabilityRow[]>(() => {
    return MOCK_INVENTORY.filter((item) => {
      const byProduct =
        availabilityProductFilter.value === "all" ||
        item.itemCode === availabilityProductFilter.value;
      const byCategory =
        availabilityCategoryFilter.value === "all" ||
        item.category === availabilityCategoryFilter.value;
      const byLocation =
        availabilityLocationFilter.value === "all" ||
        item.location === availabilityLocationFilter.value;
      const byStatus =
        availabilityStatusFilter.value === "all" ||
        item.status === availabilityStatusFilter.value;

      return byProduct && byCategory && byLocation && byStatus;
    }).map((item) => ({
      itemCode: item.itemCode,
      itemName: item.name,
      category: item.category,
      location: item.location,
      onHand: item.onHand,
      reserved: item.reserved,
      available: getAvailableStock(item),
      status: item.status,
    }));
  }, [
    availabilityProductFilter,
    availabilityCategoryFilter,
    availabilityLocationFilter,
    availabilityStatusFilter,
  ]);

  const showingFrom = useMemo(() => {
    if (meta.total === 0) return 0;
    return (meta.page - 1) * meta.pageSize + 1;
  }, [meta]);

  const showingTo = useMemo(() => {
    if (meta.total === 0) return 0;
    return Math.min(meta.page * meta.pageSize, meta.total);
  }, [meta]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedItemCode(itemCode);
    setAppliedName(name);
    setAppliedCategory(category.value);
    setAppliedLocation(location.value);
    setAppliedStatus(status.value);
  };

  const handleResetFilters = () => {
    setItemCode("");
    setName("");
    setCategory(CATEGORY_OPTIONS[0]);
    setLocation(LOCATION_OPTIONS[0]);
    setStatus(STATUS_OPTIONS[0]);
    setAppliedItemCode("");
    setAppliedName("");
    setAppliedCategory("all");
    setAppliedLocation("all");
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
    setAdjustLocation(null);
    setAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
    setIsAdjustOpen(true);
  };

  const openQuickAdjustModal = (item: InventoryRow) => {
    setSelectedItem(item);
    setQuickAdjustType(ADJUSTMENT_TYPE_OPTIONS[0]);
    setIsQuickAdjustOpen(true);
  };

  return (
    <>
      <PageShell
        title="Inventory"
        subtitle="Receive stock into Main Warehouse, transfer multiple products to branches, do manual corrections when needed, and view stock card and availability through inquiry tools."
        actions={
          <div className="flex flex-wrap gap-2">
            {canReceiveStock && (
              <Link href={"/inventory/receive" as Route}>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Receive Stock
                </Button>
              </Link>
            )}

            {canTransferToBranch && (
              <Link href={"/inventory/transfer" as Route}>
                <Button variant="outline">Transfer to Branch</Button>
              </Link>
            )}

            {canAdjustStock && (
              <Button variant="outline" onClick={openAdjustModal}>
                Adjust Stock
              </Button>
            )}

            <Button variant="outline" onClick={() => setIsStockCardOpen(true)}>
              <History className="mr-2 h-4 w-4" />
              Stock Movement
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsAvailabilityOpen(true)}
            >
              <PackageSearch className="mr-2 h-4 w-4" />
              Availability
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Inventory Records</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.totalItems}
                </h3>
                <p className="mt-2 text-sm text-sky-600">
                  Product-location records
                </p>
              </div>
              <div className="rounded-full bg-sky-50 p-2">
                <Boxes className="h-5 w-5 text-sky-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">In Stock</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.inStock}
                </h3>
                <p className="mt-2 text-sm text-emerald-600">
                  Ready for sale or transfer
                </p>
              </div>
              <div className="rounded-full bg-emerald-50 p-2">
                <PackageCheck className="h-5 w-5 text-emerald-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Low Stock</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.lowStock}
                </h3>
                <p className="mt-2 text-sm text-amber-600">
                  Needs replenishment
                </p>
              </div>
              <div className="rounded-full bg-amber-50 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-slate-500">Out of Stock</p>
                <h3 className="mt-3 text-3xl font-bold text-foreground">
                  {summary.outOfStock}
                </h3>
                <p className="mt-2 text-sm text-red-600">No usable inventory</p>
              </div>
              <div className="rounded-full bg-red-50 p-2">
                <Warehouse className="h-5 w-5 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-emerald-100 bg-emerald-50/50">
          <CardContent className="grid gap-3 p-5 md:grid-cols-5">
            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-emerald-700">
                1. Receive Stock
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Receive one or many products into{" "}
                <span className="font-semibold">{MAIN_WAREHOUSE}</span>.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-emerald-700">
                2. Transfer to Branch
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Transfer multiple products from warehouse to one branch.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-emerald-700">
                3. Adjust Stock
              </p>
              <p className="mt-1 text-sm text-slate-600">
                For damaged, recount mismatch, lost, or found stock only.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-emerald-700">
                4. Stock Movement
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Global audit trail with filters.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-white p-4">
              <p className="text-sm font-semibold text-emerald-700">
                5. Availability
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Global stock view by product and location.
              </p>
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

            <div className="w-full">
              <Select
                instanceId="inventory-category-filter"
                options={CATEGORY_OPTIONS}
                value={category}
                onChange={(option) =>
                  setCategory(option ?? CATEGORY_OPTIONS[0])
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="w-full">
              <Select
                instanceId="inventory-location-filter"
                options={LOCATION_OPTIONS}
                value={location}
                onChange={(option) =>
                  setLocation(option ?? LOCATION_OPTIONS[0])
                }
                isSearchable
                styles={reactSelectStyles}
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
                className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
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
                <p className="text-sm text-slate-500">
                  Showing {showingFrom} to {showingTo} of {meta.total} location
                  records grouped by product
                  {isFetching && !isLoading ? " • Updating..." : ""}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1400px]">
                <thead className="bg-slate-50">
                  <tr className="border-b">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Product
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Category
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total On Hand
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total Reserved
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total Available
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reorder Level
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Unit Cost
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Branches
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Expand
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-16 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading inventory...
                        </div>
                      </td>
                    </tr>
                  ) : groupedRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={10}
                        className="px-5 py-16 text-center text-slate-500"
                      >
                        No inventory records found.
                      </td>
                    </tr>
                  ) : (
                    groupedRows.map((group) => {
                      const isExpanded = !!expandedProducts[group.itemCode];

                      return (
                        <React.Fragment key={group.itemCode}>
                          <tr className="border-b bg-white transition-colors hover:bg-slate-50">
                            <td className="px-5 py-4">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {group.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {group.itemCode} • Last updated:{" "}
                                  {group.lastUpdated}
                                </p>
                              </div>
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {group.category}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {group.totalOnHand}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {group.totalReserved}
                            </td>

                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                              {group.totalAvailable}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {group.reorderLevel}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {formatPeso(group.unitCost)}
                            </td>

                            <td className="px-5 py-4 text-sm text-slate-600">
                              {group.locations.length}
                            </td>

                            <td className="px-5 py-4 text-sm">
                              <Badge
                                className={getStockBadgeClass(group.status)}
                              >
                                {group.status}
                              </Badge>
                            </td>

                            <td className="px-5 py-4">
                              <Button
                                variant="outline"
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
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={10} className="bg-slate-50 p-0">
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[1200px]">
                                    <thead className="bg-slate-100">
                                      <tr className="border-b">
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Location Type
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Location
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          On Hand
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Reserved
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Available
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Reorder Level
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Status
                                        </th>
                                        <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Row Action
                                        </th>
                                      </tr>
                                    </thead>

                                    <tbody>
                                      {group.locations.map((item) => {
                                        const isWarehouse =
                                          item.location === MAIN_WAREHOUSE;

                                        return (
                                          <tr
                                            key={item.id}
                                            className="border-b bg-white hover:bg-slate-50"
                                          >
                                            <td className="px-5 py-4 text-sm">
                                              <Badge
                                                className={
                                                  isWarehouse
                                                    ? "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50"
                                                    : "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50"
                                                }
                                              >
                                                {isWarehouse
                                                  ? "Warehouse"
                                                  : "Branch"}
                                              </Badge>
                                            </td>

                                            <td className="px-5 py-4 text-sm">
                                              <Badge
                                                className={getLocationBadgeClass(
                                                  item.location,
                                                )}
                                              >
                                                {isWarehouse ? (
                                                  <span className="inline-flex items-center gap-1">
                                                    <Warehouse className="h-3.5 w-3.5" />
                                                    {item.location}
                                                  </span>
                                                ) : (
                                                  <span className="inline-flex items-center gap-1">
                                                    <Building2 className="h-3.5 w-3.5" />
                                                    {item.location}
                                                  </span>
                                                )}
                                              </Badge>
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                              {item.onHand}
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                              {item.reserved}
                                            </td>

                                            <td className="px-5 py-4 text-sm font-semibold text-slate-700">
                                              {getAvailableStock(item)}
                                            </td>

                                            <td className="px-5 py-4 text-sm text-slate-600">
                                              {item.reorderLevel}
                                            </td>

                                            <td className="px-5 py-4 text-sm">
                                              <Badge
                                                className={getStockBadgeClass(
                                                  item.status,
                                                )}
                                              >
                                                {item.status}
                                              </Badge>
                                            </td>

                                            <td className="px-5 py-4">
                                              {canAdjustStock ? (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                                                  onClick={() =>
                                                    openQuickAdjustModal(item)
                                                  }
                                                >
                                                  Quick Adjust
                                                </Button>
                                              ) : (
                                                <span className="text-sm text-slate-400">
                                                  —
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
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

            <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Page {meta.page} of {Math.max(meta.totalPages, 1)}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={meta.page <= 1 || isFetching}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((prev) => Math.min(prev + 1, meta.totalPages || 1))
                  }
                  disabled={meta.page >= meta.totalPages || isFetching}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
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
            setAdjustLocation(null);
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
                <Label>Product</Label>
                <Select
                  instanceId="adjust-product"
                  options={PRODUCT_OPTIONS}
                  value={adjustProduct}
                  onChange={(option) => setAdjustProduct(option)}
                  isSearchable
                  placeholder="Select product"
                  styles={reactSelectStyles}
                />
              </div>

              <div className="space-y-2">
                <Label>Location</Label>
                <Select
                  instanceId="adjust-location"
                  options={LOCATION_OPTIONS.filter(
                    (item) => item.value !== "all",
                  )}
                  value={adjustLocation}
                  onChange={(option) => setAdjustLocation(option)}
                  isSearchable
                  placeholder="Select location"
                  styles={reactSelectStyles}
                />
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
                <Label htmlFor="adjustment-qty">Quantity</Label>
                <Input id="adjustment-qty" type="number" placeholder="0" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adjustment-reference">Reference No.</Label>
                <Input id="adjustment-reference" placeholder="ADJ-000123" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="adjustment-reason">Reason</Label>
                <Input
                  id="adjustment-reason"
                  placeholder="Damaged item, recount correction, missing stock, found stock, expired item, etc."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="adjustment-remarks">Remarks</Label>
                <Input
                  id="adjustment-remarks"
                  placeholder="Additional notes for this stock adjustment"
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Use stock adjustment only when the actual physical count does not
              match the system.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdjustOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => setIsAdjustOpen(false)}
            >
              Save Adjustment
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
                <Label htmlFor="quick-adjust-qty">Quantity</Label>
                <Input id="quick-adjust-qty" type="number" placeholder="0" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-reference">Reference No.</Label>
                <Input id="quick-adjust-reference" placeholder="ADJ-000124" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-reason">Reason</Label>
                <Input
                  id="quick-adjust-reason"
                  placeholder="Wrong encoding, recount mismatch, damaged, etc."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-adjust-remarks">Remarks</Label>
                <Input
                  id="quick-adjust-remarks"
                  placeholder="Additional notes"
                />
              </div>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
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
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => setIsQuickAdjustOpen(false)}
            >
              Save Quick Adjust
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
                options={LOCATION_OPTIONS}
                value={stockCardLocationFilter}
                onChange={(option) =>
                  setStockCardLocationFilter(option ?? LOCATION_OPTIONS[0])
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
              <thead className="bg-slate-50">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Movement Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Remarks
                  </th>
                </tr>
              </thead>

              <tbody>
                {stockCardRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      No stock card records found.
                    </td>
                  </tr>
                ) : (
                  stockCardRows.map((movement) => (
                    <tr
                      key={movement.id}
                      className="border-b hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div>
                          <p className="font-medium">{movement.itemName}</p>
                          <p className="text-xs text-slate-500">
                            {movement.itemCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {movement.type}
                      </td>
                      <td
                        className={`px-4 py-3 text-sm font-medium ${
                          movement.qty >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {movement.qty > 0 ? `+${movement.qty}` : movement.qty}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.reference}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {movement.location}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
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
            <SheetTitle>Availability</SheetTitle>
            <SheetDescription>
              Global stock availability by product and location.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Select
                instanceId="availability-product-filter"
                options={[
                  { value: "all", label: "All Products" },
                  ...PRODUCT_OPTIONS,
                ]}
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
                options={CATEGORY_OPTIONS}
                value={availabilityCategoryFilter}
                onChange={(option) =>
                  setAvailabilityCategoryFilter(option ?? CATEGORY_OPTIONS[0])
                }
                isSearchable
                styles={reactSelectStyles}
              />
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                instanceId="availability-location-filter"
                options={LOCATION_OPTIONS}
                value={availabilityLocationFilter}
                onChange={(option) =>
                  setAvailabilityLocationFilter(option ?? LOCATION_OPTIONS[0])
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
              <thead className="bg-slate-50">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Location
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    On Hand
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reserved
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Available
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {availabilityRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      No availability records found.
                    </td>
                  </tr>
                ) : (
                  availabilityRows.map((row) => (
                    <tr
                      key={`${row.itemCode}-${row.location}`}
                      className="border-b hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div>
                          <p className="font-medium">{row.itemName}</p>
                          <p className="text-xs text-slate-500">
                            {row.itemCode}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.category}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          {row.location === MAIN_WAREHOUSE ? (
                            <Warehouse className="h-4 w-4 text-sky-600" />
                          ) : (
                            <MapPin className="h-4 w-4 text-violet-600" />
                          )}
                          {row.location}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.onHand}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {row.reserved}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">
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
