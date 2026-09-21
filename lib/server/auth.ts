import "server-only";

import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { prisma } from "@/lib/server/prisma";
import { resolveAuthTrustedOrigins } from "@/lib/server/auth-origins";
import { recordAuditLog } from "@/lib/server/services/audit-log";

/** The branches a signing-in user is scoped to, for the Access audit entries. */
async function assignedLocationLabel(userId: string | null | undefined) {
  if (!userId) return "-";
  const assignments = await prisma.userLocation.findMany({
    where: { userId },
    select: { location: { select: { code: true, name: true } } },
    orderBy: { locationId: "asc" },
  });
  if (assignments.length === 0) return "All locations";
  return assignments.map((assignment) => assignment.location.name).join(", ");
}

// Sign-in, failed sign-in, and sign-out are recorded here because Better Auth
// owns those routes; every other audited action is written by its own service.
const authAudit = createAuthMiddleware(async (ctx) => {
  const path = ctx.path;
  if (path !== "/sign-in/email") return;
  const request = ctx.request;
  const network = {
    ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };

  const attemptedEmail = typeof ctx.body?.email === "string" ? ctx.body.email : "unknown email";
  const returned = ctx.context.returned;
  if (returned instanceof APIError) {
    await recordAuditLog({
      category: "Access",
      action: "Sign-in Failed",
      actorLabel: attemptedEmail,
      details: `Failed sign-in for ${attemptedEmail}. ${returned.body?.code ?? returned.message}`,
      ...network,
    });
    return;
  }

  const user = ctx.context.newSession?.user;
  const locationLabel = await assignedLocationLabel(user?.id);
  await recordAuditLog({
    category: "Access",
    action: "Signed In",
    actorId: user?.id ?? null,
    actorLabel: user?.name ?? attemptedEmail,
    locationLabel,
    details: `Signed in ${user?.email ?? attemptedEmail} from ${locationLabel === "-" ? "an unknown branch" : locationLabel}`,
    facts: [{ label: "Account", value: user?.email ?? attemptedEmail }, { label: "Assigned branches", value: locationLabel }],
    ...network,
  });
});

// The session row is gone by the time the sign-out response is built, so the
// user behind a sign-out is resolved before Better Auth deletes it.
const authAuditBefore = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-out") return;
  const request = ctx.request;
  const cookie = request?.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(cookie);
  const token = match ? decodeURIComponent(match[1]).split(".")[0] : null;
  const session = token
    ? await prisma.session.findUnique({ where: { token }, select: { user: { select: { id: true, name: true, email: true } } } })
    : null;
  const locationLabel = await assignedLocationLabel(session?.user.id);
  await recordAuditLog({
    category: "Access",
    action: "Signed Out",
    actorId: session?.user.id ?? null,
    actorLabel: session?.user.name ?? "Unknown user",
    locationLabel,
    details: session?.user.email
      ? `Signed out ${session.user.email} from ${locationLabel === "-" ? "an unknown branch" : locationLabel}`
      : "Signed out an unknown session",
    facts: session?.user.email ? [{ label: "Account", value: session.user.email }, { label: "Assigned branches", value: locationLabel }] : undefined,
    ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request?.headers.get("user-agent") ?? null,
  });
});

export const auth = betterAuth({
  appName: "Predator Sales & Inventory",
  trustedOrigins: resolveAuthTrustedOrigins({
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
  }),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Better Auth 1.6.23 only honors `emailAndPassword.disableSignUp`; a
    // top-level flag is silently ignored and leaves public sign-up enabled.
    disableSignUp: true,
  },
  hooks: {
    before: authAuditBefore,
    after: authAudit,
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
