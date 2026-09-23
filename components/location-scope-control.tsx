"use client";

import { Lock } from "lucide-react";
import ReactSelect, { type StylesConfig } from "react-select";

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
  /** "all", or one or more active operational location codes, comma separated. */
  value: string;
  onValueChange?: (value: string) => void;
  id?: string;
};

type ScopeSelectOption = { value: string; label: string };

function scopeOptions(locations: readonly ScopeLocationOption[]): ScopeSelectOption[] {
  return locations.map((location) => ({
    value: location.code,
    label: `${location.name} (${location.code})`,
  }));
}

/** "all", or the comma-separated codes the caller keeps in one string. */
export function parseScopeValue(value: string): string[] {
  if (!value || value === "all") return [];
  return [...new Set(value.split(",").map((code) => code.trim()).filter(Boolean))];
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
    const selectedCodes = parseScopeValue(value);
    const selected = options.filter((option) => selectedCodes.includes(option.value));
    return (
      <ReactSelect<ScopeSelectOption, true>
        instanceId={id}
        inputId={id}
        aria-label="Inventory location scope"
        isMulti
        options={options}
        value={selected}
        // Picking nothing is the plain-language meaning of all locations, so
        // the list needs no separate "All" entry that fights the other picks.
        placeholder="All locations"
        onChange={(picked) => {
          const codes = (picked ?? []).map((option) => option.value);
          onValueChange?.(codes.length ? codes.join(",") : "all");
        }}
        closeMenuOnSelect={false}
        isSearchable
        // The shared rules are declared for single selects; the option shape is
        // identical here, and only the IsMulti flag in the type differs.
        styles={reactSelectStyles as unknown as StylesConfig<ScopeSelectOption, true>}
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
