"use client";

import { Lock } from "lucide-react";
import ReactSelect from "react-select";

import { reactSelectStyles } from "@/app/inventory/_data";
import type { LocationScopeDto } from "@/lib/contracts/access";
import { cn } from "@/lib/utils";

export type ScopeLocationOption = {
  id: string;
  code: string;
  name: string;
};

export type LocationScopeControlProps = {
  scope: LocationScopeDto;
  locations: readonly ScopeLocationOption[];
  /** Current selected scope value: "all" or one active operational location code. */
  value: string;
  onValueChange?: (value: string) => void;
  id?: string;
};

function scopeOptions(locations: readonly ScopeLocationOption[]) {
  return [
    { value: "all", label: "All locations" },
    ...locations.map((location) => ({
      value: location.code,
      label: `${location.name} (${location.code})`,
    })),
  ];
}

/**
 * Authoritative Inventory location-scope feedback rendered only for roles that
 * hold the inventory:view capability:
 * - Admin gets an enabled selector over All plus active Stock Room and branches.
 * - Stock Staff is fixed read-only to Stock Room (SR).
 * - Branch Staff is fixed read-only to its persisted active branch.
 * - Accounting Staff has no inventory capability, so nothing renders here;
 *   its Business-wide feedback lives only in the global AppHeader.
 */
export function LocationScopeControl({
  scope,
  locations,
  value,
  onValueChange,
  id,
}: LocationScopeControlProps) {
  if (scope.kind !== "location") {
    const options = scopeOptions(locations);
    return (
      <ReactSelect
        instanceId={id}
        inputId={id}
        aria-label="Inventory location scope"
        options={options}
        value={options.find((option) => option.value === value) ?? options[0]}
        onChange={(option) => onValueChange?.(option?.value ?? "all")}
        isSearchable
        styles={reactSelectStyles}
        menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
        menuPosition="fixed"
      />
    );
  }

  // A single selected location is static read-only feedback.
  return (
    <div
      id={id}
      aria-label="Inventory location scope (read-only)"
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2",
        "text-sm text-muted-foreground",
      )}
    >
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate" title={scope.label}>
        {scope.label}
      </span>
      <span className="sr-only">(read-only)</span>
    </div>
  );
}
