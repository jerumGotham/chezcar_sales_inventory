"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode, type ThHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";
export type SortState<K extends string> = { key: K; direction: SortDirection } | null;
type SortValue = string | number | Date | boolean | null | undefined;

const collator = new Intl.Collator("en-PH", { numeric: true, sensitivity: "base" });

function compareValues(left: SortValue, right: SortValue) {
  // Blanks sort last whichever way the column runs.
  const leftBlank = left === null || left === undefined || left === "";
  const rightBlank = right === null || right === undefined || right === "";
  if (leftBlank || rightBlank) return leftBlank === rightBlank ? 0 : leftBlank ? 1 : -1;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return collator.compare(String(left), String(right));
}

/**
 * Sorts the rows a table already holds. A server-paginated list sorts the page
 * on screen, not the whole result: the header says so by sorting what is shown.
 * Clicking a header cycles ascending, descending, then back to the API's order.
 */
export function useTableSort<T, K extends string>(
  rows: readonly T[] | undefined,
  accessors: Record<K, (row: T) => SortValue>,
  initial: SortState<K> = null,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const list = rows ? [...rows] : [];
    if (!sort) return list;
    const read = accessors[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    // Stable: equal rows keep the order the API returned.
    return list
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const leftValue = read(left.row);
        const rightValue = read(right.row);
        const blanks = (leftValue === null || leftValue === undefined || leftValue === "") !== (rightValue === null || rightValue === undefined || rightValue === "");
        const result = compareValues(leftValue, rightValue);
        return (blanks ? result : result * factor) || left.index - right.index;
      })
      .map(({ row }) => row);
    // accessors is usually an inline object; the key is what selects the column.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  function toggle(key: K) {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  return { rows: sorted, sort, toggle, setSort };
}

/**
 * A header cell that sorts its column. Pass the same classes the plain <th>
 * had; the label becomes a button so the column sorts from the keyboard too.
 */
export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
  ...props
}: {
  label: ReactNode;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
} & Omit<ThHTMLAttributes<HTMLTableCellElement>, "onClick">) {
  const active = sort?.key === sortKey ? sort.direction : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      {...props}
      className={className}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          align === "right" && "ml-auto flex-row-reverse",
          align === "center" && "mx-auto",
          active && "text-foreground",
        )}
        style={{ font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
      >
        {label}
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", !active && "opacity-40")} />
      </button>
    </th>
  );
}
