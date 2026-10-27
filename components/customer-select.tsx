"use client";

import { useCallback, useRef } from "react";
import AsyncSelect from "react-select/async";
import type { StylesConfig } from "react-select";

import { customerOptionLabel, type CustomerTypeDto } from "@/lib/contracts/customers";

export type CustomerOption = { value: string; label: string };

type CustomerSearchResponse = { data: { customers: Array<{ id: string; name: string; type: CustomerTypeDto }> } };

const NO_EXTRA_OPTIONS: CustomerOption[] = [];

/*
 * The customer list is asked for as it is typed rather than carried in the
 * page's options payload. The branch keys a couple of hundred customers a
 * month, so a list fetched once and filtered in the browser has to be capped,
 * and a capped list quietly stops holding the person the cashier is looking
 * for: the name is in Customer Maintenance and absent from the sale.
 */
export function CustomerSelect({
  instanceId,
  value,
  onChange,
  styles,
  placeholder = "Search customer...",
  extraOptions = NO_EXTRA_OPTIONS,
  isDisabled,
}: {
  instanceId: string;
  value: CustomerOption | null;
  onChange: (option: CustomerOption | null) => void;
  styles: StylesConfig<CustomerOption, false>;
  placeholder?: string;
  /**
   * Choices that are not customers, such as POS's Guest, kept at the top.
   * Pass a constant: a fresh array each render rebuilds the loader and makes
   * the dropdown fetch again on every keystroke.
   */
  extraOptions?: CustomerOption[];
  isDisabled?: boolean;
}) {
  const search = useCallback(
    async (input: string): Promise<CustomerOption[]> => {
      const params = new URLSearchParams();
      if (input.trim()) params.set("q", input.trim());
      const response = await fetch(`/api/customers/search?${params}`, { credentials: "same-origin" });
      const json = (await response.json()) as CustomerSearchResponse;
      /*
       * The server has already filtered, so react-select shows what comes back
       * untouched; the extras have to be filtered here or Guest sits at the top
       * of a search for a named customer and takes the Enter meant for them.
       */
      const extras = extraOptions.filter((option) => option.label.toLowerCase().includes(input.trim().toLowerCase()));
      if (!response.ok) return extras;
      return [
        ...extras,
        ...json.data.customers.map((customer) => ({ value: customer.id, label: customerOptionLabel(customer.name, customer.type) })),
      ];
    },
    [extraOptions],
  );

  /*
   * One request per pause in the typing, not one per letter. A promise left
   * behind by a superseded keystroke is simply never settled, which is how
   * react-select expects a stale load to end.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadOptions = useCallback(
    (input: string) =>
      new Promise<CustomerOption[]>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => resolve(search(input)), 250);
      }),
    [search],
  );

  return (
    <AsyncSelect
      instanceId={instanceId}
      value={value}
      onChange={(option) => onChange(option)}
      loadOptions={loadOptions}
      defaultOptions
      cacheOptions
      isDisabled={isDisabled}
      placeholder={placeholder}
      loadingMessage={() => "Searching..."}
      noOptionsMessage={() => "No customers found"}
      styles={styles}
    />
  );
}
