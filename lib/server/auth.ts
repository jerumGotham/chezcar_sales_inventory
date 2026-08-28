import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/server/prisma";

export const auth = betterAuth({
  appName: "Chezcar Sales & Inventory",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Better Auth 1.6.23 only honors `emailAndPassword.disableSignUp`; a
    // top-level flag is silently ignored and leaves public sign-up enabled.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["ADMIN", "STOCK_STAFF", "BRANCH_STAFF", "ACCOUNTING_STAFF"],
        required: true,
        defaultValue: "BRANCH_STAFF",
        input: false,
      },
      status: {
        type: ["ACTIVE", "INACTIVE"],
        required: true,
        defaultValue: "ACTIVE",
        input: false,
      },
      locationId: {
        type: "string",
        required: false,
        input: false,
      },
      roleDefinitionId: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
});
