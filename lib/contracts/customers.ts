import { z } from "zod";

/**
 * Client-safe customer contracts: the kind of party a customer is, and how
 * that kind is worded on screen.
 *
 * A customer is not always a person. A company, a government office, and a
 * parish all buy, and each is one legal party with one name rather than a
 * first and last name. The type drives both the label on the single name
 * field and the way the customer reads in a picker, so the wording lives here
 * once instead of being retyped on every screen.
 *
 * This module must never import server-only Prisma; it is consumed by route
 * handlers, services, and browser callers alike.
 */

export const CUSTOMER_TYPES = [
  "INDIVIDUAL",
  "COMPANY",
  "GOVERNMENT",
  "RELIGIOUS_ORGANIZATION",
] as const;

export type CustomerTypeDto = (typeof CUSTOMER_TYPES)[number];

export const DEFAULT_CUSTOMER_TYPE: CustomerTypeDto = "INDIVIDUAL";

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

/** How the type itself is written, in the dropdown and beside a name. */
const CUSTOMER_TYPE_LABELS: Record<CustomerTypeDto, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
  GOVERNMENT: "Government",
  RELIGIOUS_ORGANIZATION: "Religious Organization",
};

/**
 * What the one name field is called. An individual has a customer name, a
 * company has a company name, and the other two are named for the body
 * rather than for the person signing, so neither reads as "Government Name".
 */
const CUSTOMER_NAME_LABELS: Record<CustomerTypeDto, string> = {
  INDIVIDUAL: "Customer Name",
  COMPANY: "Company Name",
  GOVERNMENT: "Agency Name",
  RELIGIOUS_ORGANIZATION: "Organization Name",
};

export function customerTypeLabel(type: CustomerTypeDto | null | undefined): string {
  return CUSTOMER_TYPE_LABELS[type ?? DEFAULT_CUSTOMER_TYPE];
}

export function customerNameLabel(type: CustomerTypeDto | null | undefined): string {
  return CUSTOMER_NAME_LABELS[type ?? DEFAULT_CUSTOMER_TYPE];
}

export const CUSTOMER_TYPE_OPTIONS: ReadonlyArray<{ value: CustomerTypeDto; label: string }> =
  CUSTOMER_TYPES.map((type) => ({ value: type, label: CUSTOMER_TYPE_LABELS[type] }));

/**
 * How a customer reads in a picker: the name, then the kind of party it is.
 * A cashier choosing between a person and the company they work for needs the
 * type in the row, because the two names can be nearly identical.
 */
export function customerOptionLabel(
  name: string,
  type: CustomerTypeDto | null | undefined,
): string {
  return `${name} - ${customerTypeLabel(type)}`;
}
