"use client";

import { Lock } from "lucide-react";

import type { LocationScopeDto, ShellRole } from "@/lib/contracts/access";
import { cn } from "@/lib/utils";

export type ScopeLocationOption = {
  id: string;
  code: string;
  name: string;
};

export type LocationScopeControlProps = {
  role: ShellRole;
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
  role,
  scope,
  locations,
  value,
  onValueChange,
  id,
}: LocationScopeControlProps) {
  if (role === "ACCOUNTING_STAFF") {
    return null;
  }

  if (role === "ADMIN") {
    return (
      <select
        id={id}
        aria-label="Inventory location scope"
        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {scopeOptions(locations).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  // Stock Staff and Branch Staff see their persisted scope as static,
  // read-only feedback; no selection control exists for these roles.
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
