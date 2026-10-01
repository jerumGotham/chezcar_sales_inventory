import { z } from "zod";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullish().transform((value) => value || null);

const supplierFields = {
  code: optionalText(30).transform((value) => value?.toUpperCase() ?? null),
  name: z.string().trim().min(1, "Enter a supplier name.").max(200),
  contactPerson: optionalText(120),
  contactNumber: optionalText(60),
  email: optionalText(200).pipe(z.email().nullable()),
  address: optionalText(300),
  notes: optionalText(1000),
};

export const createSupplierSchema = z.object(supplierFields);
export const updateSupplierSchema = z.object(supplierFields).partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one editable field is required",
);
export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  /** Matched against code, name and contact person together. */
  search: z.string().trim().max(200).default(""),
  status: z.enum(["all", "active", "inactive"]).default("all"),
});

export const supplierStatusRequestSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CreateSupplierRequest = z.input<typeof createSupplierSchema>;
export type UpdateSupplierRequest = z.input<typeof updateSupplierSchema>;
export type SupplierStatusRequest = z.infer<typeof supplierStatusRequestSchema>;

export type SupplierDto = {
  id: string;
  code: string | null;
  name: string;
  contactPerson: string | null;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type SupplierOptionDto = Pick<SupplierDto, "id" | "code" | "name">;

/** The page the list screens read, in the shape TablePagination expects. */
export type MaintenanceListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SupplierListResponse = { data: SupplierDto[]; meta: MaintenanceListMeta };
