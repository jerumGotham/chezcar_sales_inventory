import { z } from "zod";

/**
 * Client-safe User Management contracts: fixed wire types, Zod request
 * schemas, stable error envelopes, and same-origin client functions.
 *
 * This module must never import server-only code; it is consumed by both
 * route handlers/services and browser callers.
 */

export const MANAGEABLE_USER_ROLES = [
  "STOCK_STAFF",
  "BRANCH_STAFF",
  "ACCOUNTING_STAFF",
] as const;
export type ManageableUserRole = (typeof MANAGEABLE_USER_ROLES)[number];

export const MANAGED_USER_ROLES = ["ADMIN", ...MANAGEABLE_USER_ROLES] as const;
export type ManagedUserRole = (typeof MANAGED_USER_ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type UserStatusDto = (typeof USER_STATUSES)[number];

export const CANONICAL_LOCATION_CODES = ["SR", "QC", "BL", "LU", "VC", "SP"] as const;
export type CanonicalLocationCode = (typeof CANONICAL_LOCATION_CODES)[number];

export const USER_LIST_PAGE_SIZE = 10;

const userNameSchema = z.string().trim().min(1).max(120);
const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email());
const temporaryPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

/**
 * Create accepts only the three staff roles. ADMIN is structurally
 * unreachable. Location is carried only for Branch Staff: Stock Staff is
 * resolved to the active SR warehouse server-side and Accounting Staff never
 * carries a location assignment, so hostile extra fields cannot persist.
 */
export const createUserRequestSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("STOCK_STAFF"),
    name: userNameSchema,
    email: userEmailSchema,
    temporaryPassword: temporaryPasswordSchema,
  }),
  z.object({
    role: z.literal("BRANCH_STAFF"),
    name: userNameSchema,
    email: userEmailSchema,
    temporaryPassword: temporaryPasswordSchema,
    locationId: z.string().min(1),
  }),
  z.object({
    role: z.literal("ACCOUNTING_STAFF"),
    name: userNameSchema,
    email: userEmailSchema,
    temporaryPassword: temporaryPasswordSchema,
  }),
]);
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/**
 * Update validates the full resulting role/location assignment server-side.
 * `role` and `locationId` are optional; the service derives the effective
 * assignment from the persisted target state.
 */
export const updateUserRequestSchema = z
  .object({
    name: userNameSchema.optional(),
    email: userEmailSchema.optional(),
    role: z.enum(MANAGEABLE_USER_ROLES).optional(),
    locationId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required",
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const userStatusRequestSchema = z.object({
  status: z.enum(USER_STATUSES),
});
export type UserStatusRequest = z.infer<typeof userStatusRequestSchema>;

export const resetUserPasswordRequestSchema = z.object({
  newPassword: temporaryPasswordSchema,
});
export type ResetUserPasswordRequest = z.infer<
  typeof resetUserPasswordRequestSchema
>;

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  search: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(200).optional(),
  ),
  role: z.enum(MANAGEABLE_USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  location: z
    .union([z.enum(CANONICAL_LOCATION_CODES), z.literal("none")])
    .optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export type UserListFilters = {
  page?: number;
  search?: string;
  role?: ManageableUserRole;
  status?: UserStatusDto;
  location?: CanonicalLocationCode | "none";
};

export type UserLocationDto = {
  id: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "BRANCH";
};

/**
 * Safe managed-user projection. Credential hashes, session records, and the
 * Better Auth ban compatibility fields are deliberately excluded.
 */
export type ManagedUserDto = {
  id: string;
  name: string;
  email: string;
  role: ManagedUserRole;
  status: UserStatusDto;
  isOwner: boolean;
  location: UserLocationDto | null;
  credentialSetupRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserListMetaDto = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  totalStaff: number;
  activeStaff: number;
  inactiveStaff: number;
};

export type UserListResponseDto = {
  data: ManagedUserDto[];
  meta: UserListMetaDto;
};

export type UserMutationResponseDto = { data: ManagedUserDto };

export type ApiErrorBody = {
  error?: { code?: string; message?: string };
};

/** Stable typed failure for same-origin User Management calls. */
export class UsersApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UsersApiError";
  }
}

async function usersFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    let code = "REQUEST_FAILED";
    let message = "The user request could not be completed.";
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      // Non-JSON error bodies keep the stable fallback above.
    }
    throw new UsersApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}

function buildUsersQuery(filters: UserListFilters): string {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set("page", String(filters.page));
  if (filters.search !== undefined && filters.search !== "")
    params.set("search", filters.search);
  if (filters.role !== undefined) params.set("role", filters.role);
  if (filters.status !== undefined) params.set("status", filters.status);
  if (filters.location !== undefined) params.set("location", filters.location);
  return params.toString();
}

export function listUsers(
  filters: UserListFilters = {},
): Promise<UserListResponseDto> {
  const query = buildUsersQuery(filters);
  return usersFetch<UserListResponseDto>(`/api/users${query ? `?${query}` : ""}`);
}

export async function createUser(
  request: CreateUserRequest,
): Promise<ManagedUserDto> {
  const response = await usersFetch<UserMutationResponseDto>("/api/users", {
    method: "POST",
    body: JSON.stringify(request),
  });
  return response.data;
}

export async function updateUser(
  userId: string,
  request: UpdateUserRequest,
): Promise<ManagedUserDto> {
  const response = await usersFetch<UserMutationResponseDto>(
    `/api/users/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify(request) },
  );
  return response.data;
}

export async function setUserStatus(
  userId: string,
  status: UserStatusDto,
): Promise<ManagedUserDto> {
  const response = await usersFetch<UserMutationResponseDto>(
    `/api/users/${encodeURIComponent(userId)}/status`,
    { method: "POST", body: JSON.stringify({ status }) },
  );
  return response.data;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<ManagedUserDto> {
  const response = await usersFetch<UserMutationResponseDto>(
    `/api/users/${encodeURIComponent(userId)}/password`,
    { method: "POST", body: JSON.stringify({ newPassword }) },
  );
  return response.data;
}
