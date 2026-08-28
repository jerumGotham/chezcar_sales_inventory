import { z } from "zod";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullish().transform((value) => value || null);

export const createBranchSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/)
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  address: optionalText(300),
  city: optionalText(120),
  contactNumber: optionalText(60),
  email: optionalText(200).pipe(z.email().nullable()),
  notes: optionalText(500),
});

export const updateBranchSchema = createBranchSchema.omit({ code: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one editable field is required",
);

export type CreateBranchRequest = z.input<typeof createBranchSchema>;
export type UpdateBranchRequest = z.input<typeof updateBranchSchema>;

export type BranchDto = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  contactNumber: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
