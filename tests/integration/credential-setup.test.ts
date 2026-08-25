import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:55435/chezcar_test_01_13?schema=public";
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/prisma", async () => import("../../lib/server/prisma"));
vi.mock("@/lib/server/auth", async () => import("../../lib/server/auth"));
vi.mock("@/lib/server/policy/access", async () =>
  import("../../lib/server/policy/access"),
);
vi.mock("@/lib/server/authorization", async () =>
  import("../../lib/server/authorization"),
);
vi.mock("@/lib/server/internal-user-auth", async () =>
  import("../../lib/server/internal-user-auth"),
);
vi.mock("@/lib/server/services/users", async () =>
  import("../../lib/server/services/users"),
);
vi.mock("@/lib/contracts/users", async () => import("../../lib/contracts/users"));

import { auth } from "../../lib/server/auth";
import { prisma as sharedPrisma } from "../../lib/server/prisma";
import { withDisposableDatabase } from "../helpers/database";
import {
  createLocationFixtures,
  createUserFixture,
  type LocationFixtures,
} from "../helpers/factories";
import { createRequest } from "../helpers/requests";

const STAFF_EMAIL = "first-login.cs@example.test";
const TEMP_PASSWORD = "Temp-Pass-123";
const NEW_PASSWORD = "Fresh-Pass-456";

/**
 * Exact first-login failure copy from the approved UI-SPEC contract. The
 * server owns this string so every client renders the same fixed message.
 */
const CHANGE_FAILURE_COPY =
  "We couldn’t change your password. Your current password is unchanged.";

type CredentialRouteModule = typeof import("../../app/api/credential-setup/route");
let credentialRoute: CredentialRouteModule | null = null;

type CredentialBody = {
  data?: { credentialSetupRequired?: boolean };
  error?: { code: string; message: string };
};

/**
 * Better Auth 1.6.23 signs its session cookie, so faithful request headers
 * require a real sign-in round-trip against the public instance.
 */
async function signInUser(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const sessionCookie = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("better-auth.session_token="));
  expect(sessionCookie).toBeDefined();

  return new Headers({ cookie: sessionCookie ?? "" });
}

async function grantCredential(
  prisma: PrismaClient,
  userId: string,
  password: string,
) {
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(password);
  await prisma.account.create({
    data: {
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    },
  });
}

/**
 * Emulate the post-create/post-reset state Plan 01-09 arms: one temporary
 * credential plus a pending first-login prompt.
 */
async function prepareFirstLogin(prisma: PrismaClient) {
  const locations: LocationFixtures = await createLocationFixtures(prisma);
  const staff = await createUserFixture(prisma, locations, {
    namespace: "cs",
    key: "first-login",
    role: "BRANCH_STAFF",
    locationId: locations.branches.QC.id,
  });
  await grantCredential(prisma, staff.id, TEMP_PASSWORD);
  await prisma.user.update({
    where: { id: staff.id },
    data: { credentialSetupRequired: true },
  });

  const headers = await signInUser(prisma, STAFF_EMAIL, TEMP_PASSWORD);
  return { locations, staff, headers };
}

function credentialRequest(
  options: {
    method?: string;
    headers?: HeadersInit;
    body?: unknown;
  } = {},
) {
  return createRequest("/api/credential-setup", {
    method: options.method,
    headers: options.headers,
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

async function getCredentialState(headers: HeadersInit) {
  const response = await credentialRoute!.GET(
    credentialRequest({ headers }),
  );
  return {
    status: response.status,
    body: (await response.json()) as CredentialBody,
  };
}

async function postCredentialAction(body: unknown, headers: HeadersInit) {
  const response = await credentialRoute!.POST(
    credentialRequest({ method: "POST", headers, body }),
  );
  const raw = JSON.stringify(await response.json());
  return {
    status: response.status,
    raw,
    body: JSON.parse(raw) as CredentialBody,
  };
}

describe("first-login credential setup", () => {
  afterEach(async () => {
    await sharedPrisma.$disconnect();
  });

  it("prompts once after reset and consumes on skip until a later re-arm", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { staff, headers } = await prepareFirstLogin(prisma);
      credentialRoute = await import("../../app/api/credential-setup/route");

      const initial = await getCredentialState(headers);
      expect(initial.status).toBe(200);
      expect(initial.body.data?.credentialSetupRequired).toBe(true);

      const skip = await postCredentialAction({ action: "skip" }, headers);
      expect(skip.status).toBe(200);
      expect(skip.body.data?.credentialSetupRequired).toBe(false);
      expect(skip.raw).not.toContain(TEMP_PASSWORD);
      expect(skip.raw).not.toContain(NEW_PASSWORD);

      // Prompt consumption is final for this login period.
      const afterSkip = await getCredentialState(headers);
      expect(afterSkip.body.data?.credentialSetupRequired).toBe(false);
      const repeatedSkip = await postCredentialAction({ action: "skip" }, headers);
      expect(repeatedSkip.status).toBe(200);
      expect(repeatedSkip.body.data?.credentialSetupRequired).toBe(false);

      // A later Admin-style reset re-arms the prompt exactly once more.
      await prisma.user.update({
        where: { id: staff.id },
        data: { credentialSetupRequired: true },
      });
      const rearmed = await getCredentialState(headers);
      expect(rearmed.body.data?.credentialSetupRequired).toBe(true);
    });
  }, 120_000);

  it("changes the password through Better Auth, consumes the prompt, and revokes other sessions", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { staff, headers } = await prepareFirstLogin(prisma);
      const otherSessionHeaders = await signInUser(
        prisma,
        STAFF_EMAIL,
        TEMP_PASSWORD,
      );
      credentialRoute = await import("../../app/api/credential-setup/route");

      const change = await postCredentialAction(
        {
          action: "change",
          currentPassword: TEMP_PASSWORD,
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        },
        headers,
      );
      expect(change.status).toBe(200);
      expect(change.body.data?.credentialSetupRequired).toBe(false);
      expect(change.raw).not.toContain(TEMP_PASSWORD);
      expect(change.raw).not.toContain(NEW_PASSWORD);

      // Prompt consumption is final; repeated change stays idempotent-safe.
      const afterChange = await getCredentialState(headers);
      expect(afterChange.body.data?.credentialSetupRequired).toBe(false);

      // Other sessions are revoked; the initiating session still works.
      const revokedOther = await getCredentialState(otherSessionHeaders);
      expect(revokedOther.status).toBe(401);
      expect(revokedOther.body.error?.code).toBe("UNAUTHENTICATED");
      const currentStillValid = await getCredentialState(headers);
      expect(currentStillValid.status).toBe(200);

      // The temporary credential no longer authenticates; the new one does.
      await expect(
        auth.api.signInEmail({
          body: { email: STAFF_EMAIL, password: TEMP_PASSWORD },
        }),
      ).rejects.toThrow();
      const reauth = await auth.api.signInEmail({
        body: { email: STAFF_EMAIL, password: NEW_PASSWORD },
      });
      expect(reauth.user.id).toBe(staff.id);

      // Exactly one hashed credential account remains.
      expect(await prisma.account.count({ where: { userId: staff.id } })).toBe(1);
      const account = await prisma.account.findFirstOrThrow({
        where: { userId: staff.id },
      });
      expect(account.password).not.toContain(NEW_PASSWORD);
    });
  }, 120_000);

  it("keeps state unchanged on a wrong current password and leaks nothing", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { headers } = await prepareFirstLogin(prisma);
      credentialRoute = await import("../../app/api/credential-setup/route");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        const failedChange = await postCredentialAction(
          {
            action: "change",
            currentPassword: "Wrong-Current-9",
            newPassword: NEW_PASSWORD,
            confirmPassword: NEW_PASSWORD,
          },
          headers,
        );
        expect(failedChange.status).toBe(400);
        expect(failedChange.body.error?.code).toBe("CREDENTIAL_CHANGE_FAILED");
        expect(failedChange.body.error?.message).toBe(CHANGE_FAILURE_COPY);

        // Serialized bodies and captured logs never contain submitted values.
        expect(failedChange.raw).not.toContain("Wrong-Current-9");
        expect(failedChange.raw).not.toContain(NEW_PASSWORD);
        expect(errorSpy.mock.calls.map(String).join("\n")).not.toContain(
          "Wrong-Current-9",
        );
        expect(errorSpy.mock.calls.map(String).join("\n")).not.toContain(
          NEW_PASSWORD,
        );

        // State is unchanged: prompt still armed, temporary password intact.
        const unchanged = await getCredentialState(headers);
        expect(unchanged.body.data?.credentialSetupRequired).toBe(true);
        const stillSignedIn = await signInUser(prisma, STAFF_EMAIL, TEMP_PASSWORD);
        expect(stillSignedIn.get("cookie")).toContain("better-auth.session_token=");
      } finally {
        errorSpy.mockRestore();
      }
    });
  }, 120_000);

  it("rejects missing, expired, and revoked sessions with 401 and no state change", async () => {
    await withDisposableDatabase(async ({ prisma }) => {
      const { staff, headers } = await prepareFirstLogin(prisma);
      credentialRoute = await import("../../app/api/credential-setup/route");

      const anonymousGet = await getCredentialState(new Headers());
      expect(anonymousGet.status).toBe(401);
      expect(anonymousGet.body.error?.code).toBe("UNAUTHENTICATED");
      const anonymousPost = await postCredentialAction(
        { action: "skip" },
        new Headers(),
      );
      expect(anonymousPost.status).toBe(401);

      // A deleted (revoked) session cookie is rejected fail-closed.
      await prisma.session.deleteMany({ where: { userId: staff.id } });
      const revokedGet = await getCredentialState(headers);
      expect(revokedGet.status).toBe(401);
      const revokedPost = await postCredentialAction(
        {
          action: "change",
          currentPassword: TEMP_PASSWORD,
          newPassword: NEW_PASSWORD,
          confirmPassword: NEW_PASSWORD,
        },
        headers,
      );
      expect(revokedPost.status).toBe(401);
      expect(revokedPost.raw).not.toContain(TEMP_PASSWORD);
      expect(revokedPost.raw).not.toContain(NEW_PASSWORD);

      // Nothing was consumed or changed while unauthenticated.
      const persisted = await prisma.user.findUniqueOrThrow({
        where: { id: staff.id },
        select: { credentialSetupRequired: true },
      });
      expect(persisted.credentialSetupRequired).toBe(true);
    });
  }, 120_000);
});
