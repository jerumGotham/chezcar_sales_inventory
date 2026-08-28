import {
  type Location,
  type LocationType,
  type PrismaClient,
  type Session,
  type User,
  type UserRole,
  type UserStatus,
} from "@prisma/client";

export const BRANCH_CODES = ["QC", "BL", "LU", "VC", "SP"] as const;
export type BranchCode = (typeof BRANCH_CODES)[number];

export type LocationFixtures = {
  stockRoom: Location;
  branches: Record<BranchCode, Location>;
};

export type LocationFixtureInput = {
  code: string;
  name: string;
  type: LocationType;
  isActive?: boolean;
};

export type UserFixtureInput = {
  namespace: string;
  role: UserRole;
  locationId: string | null;
  key?: string;
  name?: string;
  status?: UserStatus;
  allowInvalidAssignment?: boolean;
};

const ROLE_DEFINITION_BY_ROLE = {
  ADMIN: {
    id: "role-admin",
    scope: "OWNER",
    permissions: [
      "dashboard:view", "customers:view", "customer-orders:view", "sales:post",
      "sales:verify:view", "sales:verify", "sales:resolve", "sales:mismatch:respond",
      "products:view", "inventory:view", "inventory-receiving:create", "reports:view",
      "users:manage", "branches:manage", "roles:manage", "stock-transfers:view",
    ],
  },
  STOCK_STAFF: {
    id: "role-stock-staff",
    scope: "STOCK_ROOM",
    permissions: ["dashboard:view", "customers:view", "customer-orders:view", "products:view", "inventory:view", "inventory-receiving:create", "stock-transfers:view"],
  },
  BRANCH_STAFF: {
    id: "role-branch-staff",
    scope: "BRANCH",
    permissions: ["dashboard:view", "customers:view", "customer-orders:view", "sales:post", "sales:verify:view", "sales:mismatch:respond", "inventory:view", "stock-transfers:view"],
  },
  ACCOUNTING_STAFF: {
    id: "role-accounting-staff",
    scope: "BUSINESS_WIDE",
    permissions: ["dashboard:view", "customers:view", "customer-orders:view", "sales:verify", "sales:verify:view", "sales:resolve", "reports:view"],
  },
} as const;

export type SessionState = "valid" | "expired" | "revoked";

export type SessionFixture = {
  id: string;
  token: string;
  state: SessionState;
  userId: string;
  persisted: boolean;
  session: Session | null;
};

export type SessionFixtureInput = {
  namespace: string;
  key: string;
  state: SessionState;
};

type CanonicalUsers = {
  admin: User;
  stockStaff: User;
  branchStaff: User;
  accountingStaff: User;
  inactiveBranchStaff: User;
};

type InvalidAssignmentUsers = {
  stockAtBranch: User;
  branchAtStockRoom: User;
};

export type AuthFixture = {
  locations: LocationFixtures;
  users: CanonicalUsers;
  sessions: {
    valid: SessionFixture;
    expired: SessionFixture;
    revoked: SessionFixture;
  };
  invalidAssignments: InvalidAssignmentUsers | null;
};

export type CreateAuthFixtureOptions = {
  namespace: string;
  includeInvalidAssignments?: boolean;
};

export async function createLocationFixture(
  prisma: PrismaClient,
  input: LocationFixtureInput,
): Promise<Location> {
  const isActive = input.isActive ?? true;

  return prisma.location.upsert({
    where: { code: input.code },
    create: { ...input, isActive },
    update: {
      name: input.name,
      type: input.type,
      isActive,
    },
  });
}

export async function createLocationFixtures(
  prisma: PrismaClient,
): Promise<LocationFixtures> {
  const stockRoom = await createLocationFixture(prisma, {
    code: "SR",
    name: "Stock Room",
    type: "WAREHOUSE",
  });
  const branchEntries = await Promise.all(
    BRANCH_CODES.map(async (code) => {
      const branch = await createLocationFixture(prisma, {
        code,
        name: `${code} Branch`,
        type: "BRANCH",
      });
      return [code, branch] as const;
    }),
  );

  return {
    stockRoom,
    branches: Object.fromEntries(branchEntries) as Record<BranchCode, Location>,
  };
}

function isValidAssignment(
  locations: LocationFixtures,
  role: UserRole,
  locationId: string | null,
) {
  const branchIds = new Set(
    Object.values(locations.branches).map((branch) => branch.id),
  );

  switch (role) {
    case "ADMIN":
    case "ACCOUNTING_STAFF":
      return locationId === null;
    case "STOCK_STAFF":
      return locationId === locations.stockRoom.id;
    case "BRANCH_STAFF":
      return locationId !== null && branchIds.has(locationId);
  }
}

function roleKey(role: UserRole) {
  return role.toLowerCase().replaceAll("_", "-");
}

export async function createUserFixture(
  prisma: PrismaClient,
  locations: LocationFixtures,
  input: UserFixtureInput,
): Promise<User> {
  if (
    !input.allowInvalidAssignment &&
    !isValidAssignment(locations, input.role, input.locationId)
  ) {
    throw new Error("Invalid role/location assignment for persisted user fixture");
  }

  const key = input.key ?? roleKey(input.role);
  const email =
    input.role === "ADMIN"
      ? "owner-admin@auth-fixture.example.test"
      : `${key}.${input.namespace}@example.test`;
  const status = input.status ?? "ACTIVE";
  const name = input.name ?? `${input.role} ${input.namespace}`;

  return prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      emailVerified: true,
      role: input.role,
      roleDefinitionId: ROLE_DEFINITION_BY_ROLE[input.role].id,
      status,
      locationId: input.locationId,
    },
    update: {
      name,
      role: input.role,
      roleDefinitionId: ROLE_DEFINITION_BY_ROLE[input.role].id,
      status,
      locationId: input.locationId,
    },
  });
}

export async function createSessionFixture(
  prisma: PrismaClient,
  user: User,
  input: SessionFixtureInput,
): Promise<SessionFixture> {
  const id = `${input.key}-${input.namespace}-session`;
  const token = `${input.key}.${input.namespace}.session-token`;
  const expiresAt = new Date(
    Date.now() + (input.state === "expired" ? -60 * 60_000 : 60 * 60_000),
  );
  const session = await prisma.session.upsert({
    where: { token },
    create: {
      id,
      token,
      expiresAt,
      userId: user.id,
      ipAddress: "127.0.0.1",
      userAgent: "chezcar-integration-test",
    },
    update: {
      expiresAt,
      userId: user.id,
    },
  });

  if (input.state === "revoked") {
    await prisma.session.delete({ where: { id: session.id } });
    return {
      id,
      token,
      state: input.state,
      userId: user.id,
      persisted: false,
      session: null,
    };
  }

  return {
    id,
    token,
    state: input.state,
    userId: user.id,
    persisted: true,
    session,
  };
}

async function createCanonicalUsers(
  prisma: PrismaClient,
  locations: LocationFixtures,
  namespace: string,
): Promise<CanonicalUsers> {
  const [admin, stockStaff, branchStaff, accountingStaff, inactiveBranchStaff] =
    await Promise.all([
      createUserFixture(prisma, locations, {
        namespace,
        key: "admin",
        role: "ADMIN",
        locationId: null,
      }),
      createUserFixture(prisma, locations, {
        namespace,
        key: "stock-staff",
        role: "STOCK_STAFF",
        locationId: locations.stockRoom.id,
      }),
      createUserFixture(prisma, locations, {
        namespace,
        key: "branch-staff",
        role: "BRANCH_STAFF",
        locationId: locations.branches.QC.id,
      }),
      createUserFixture(prisma, locations, {
        namespace,
        key: "accounting-staff",
        role: "ACCOUNTING_STAFF",
        locationId: null,
      }),
      createUserFixture(prisma, locations, {
        namespace,
        key: "inactive-branch-staff",
        role: "BRANCH_STAFF",
        status: "INACTIVE",
        locationId: locations.branches.BL.id,
      }),
    ]);

  return { admin, stockStaff, branchStaff, accountingStaff, inactiveBranchStaff };
}

async function createInvalidAssignmentUsers(
  prisma: PrismaClient,
  locations: LocationFixtures,
  namespace: string,
): Promise<InvalidAssignmentUsers> {
  const createInvalid = (
    input: Omit<UserFixtureInput, "namespace" | "allowInvalidAssignment">,
  ) =>
    createUserFixture(prisma, locations, {
      ...input,
      namespace,
      allowInvalidAssignment: true,
    });

  const [stockAtBranch, branchAtStockRoom] = await Promise.all([
    createInvalid({
      key: "invalid-stock-at-branch",
      role: "STOCK_STAFF",
      locationId: locations.branches.BL.id,
    }),
    createInvalid({
      key: "invalid-branch-at-stock-room",
      role: "BRANCH_STAFF",
      locationId: locations.stockRoom.id,
    }),
  ]);

  return {
    stockAtBranch,
    branchAtStockRoom,
  };
}

export async function createAuthFixture(
  prisma: PrismaClient,
  options: CreateAuthFixtureOptions,
): Promise<AuthFixture> {
  const locations = await createLocationFixtures(prisma);
  const users = await createCanonicalUsers(prisma, locations, options.namespace);
  const [valid, expired, revoked] = await Promise.all([
    createSessionFixture(prisma, users.admin, {
      namespace: options.namespace,
      key: "valid",
      state: "valid",
    }),
    createSessionFixture(prisma, users.branchStaff, {
      namespace: options.namespace,
      key: "expired",
      state: "expired",
    }),
    createSessionFixture(prisma, users.stockStaff, {
      namespace: options.namespace,
      key: "revoked",
      state: "revoked",
    }),
  ]);
  const invalidAssignments = options.includeInvalidAssignments
    ? await createInvalidAssignmentUsers(prisma, locations, options.namespace)
    : null;

  return {
    locations,
    users,
    sessions: { valid, expired, revoked },
    invalidAssignments,
  };
}

export async function createBranchStaffFixture(
  prisma: PrismaClient,
  locations: LocationFixtures,
  namespace: string,
  branchCode: BranchCode,
  key: string,
) {
  return createUserFixture(prisma, locations, {
    namespace,
    key,
    role: "BRANCH_STAFF",
    locationId: locations.branches[branchCode].id,
  });
}

export async function createProductFixture(
  prisma: PrismaClient,
  overrides: { itemCode: string; name: string; price?: number | string; status?: "ACTIVE" | "INACTIVE" } & Record<string, unknown>,
) {
  const price = overrides.price ?? 100;
  return prisma.product.create({
    data: {
      itemCode: overrides.itemCode,
      name: overrides.name,
      price: price as unknown as number,
      status: (overrides.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
    },
  });
}

export async function createInventoryBalanceFixture(
  prisma: PrismaClient,
  input: { locationId: string; productId: string; onHand: number; reserved?: number; reorderLevel?: number; unitCost?: number; version?: number },
) {
  const balance = await prisma.inventoryBalance.create({
    data: {
      locationId: input.locationId,
      productId: input.productId,
      onHand: input.onHand,
      reserved: input.reserved ?? 0,
      unitCost: input.unitCost ?? 10,
      version: input.version ?? 1,
    },
  });
  if (input.reorderLevel !== undefined) await prisma.product.update({ where: { id: input.productId }, data: { reorderLevel: input.reorderLevel } });
  return balance;
}

export function authContextFor(
  user: User,
  location: Location | null,
): import("@/lib/server/authorization").AuthContext {
  const accessRole = ROLE_DEFINITION_BY_ROLE[user.role];
  return {
    userId: user.id,
    role: user.role,
    roleDefinitionId: user.roleDefinitionId,
    roleScope: accessRole.scope,
    capabilities: accessRole.permissions,
    isOwner: accessRole.scope === "OWNER",
    locationId: user.locationId,
    location: location ? { id: location.id, code: location.code, type: location.type, isActive: location.isActive } : null,
  };
}
