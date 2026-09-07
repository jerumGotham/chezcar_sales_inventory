import { z } from "zod";

export const personnelTypeSchema = z.enum(["SALESPERSON", "INSTALLER", "BOTH"]);

export const createPersonnelSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a personnel name.").max(200),
  locationId: z.string().trim().min(1, "Select a home branch."),
  type: personnelTypeSchema,
});

export const updatePersonnelSchema = createPersonnelSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one editable field is required",
);

export const personnelStatusRequestSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CreatePersonnelRequest = z.input<typeof createPersonnelSchema>;
export type UpdatePersonnelRequest = z.input<typeof updatePersonnelSchema>;
export type PersonnelStatusRequest = z.infer<typeof personnelStatusRequestSchema>;

export type PersonnelBranchOptionDto = {
  id: string;
  code: string;
  name: string;
};

export type SalespersonOptionDto = {
  id: string;
  fullName: string;
  locationId: string;
};

export type SalespersonSnapshotDto = {
  personnelId: string;
  name: string;
  branch: PersonnelBranchOptionDto;
};

export type PersonnelDto = {
  id: string;
  fullName: string;
  locationId: string;
  location: PersonnelBranchOptionDto;
  type: "SALESPERSON" | "INSTALLER" | "BOTH";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};
