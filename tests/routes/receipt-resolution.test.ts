import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActiveUser: vi.fn(),
  assertAnyCapability: vi.fn(),
  assertCapability: vi.fn(),
  authorizationErrorResponse: vi.fn(() =>
    Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
  ),
  resolveSale: vi.fn(),
}));

vi.mock("@/lib/server/authorization", () => ({
  requireActiveUser: mocks.requireActiveUser,
  assertAnyCapability: mocks.assertAnyCapability,
  assertCapability: mocks.assertCapability,
  authorizationErrorResponse: mocks.authorizationErrorResponse,
}));
vi.mock("@/lib/server/services/customer-sales", async () => {
  const { z } = await import("zod");
  class CustomerSalesError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
    }
  }
  return {
    accountingResolutionSchema: z.object({
      action: z.enum(["CONFIRMED_CORRECT", "VOIDED_REPLACED"]),
      note: z.string().min(1),
    }),
    CustomerSalesError,
    resolveSale: mocks.resolveSale,
  };
});
vi.mock("server-only", () => ({}));

import { POST } from "../../app/api/accounting/receipts/[saleId]/resolve/route";

function request(body: string) {
  return new Request("http://localhost/api/accounting/receipts/sale-1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const context = { params: Promise.resolve({ saleId: "sale-1" }) };

describe("receipt resolution route authorization", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireActiveUser.mockResolvedValue({ userId: "reviewer-1" });
    mocks.authorizationErrorResponse.mockReturnValue(
      Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }),
    );
  });

  it("rejects callers without either resolution action before reading input", async () => {
    mocks.assertAnyCapability.mockImplementation(() => {
      throw new Error("denied");
    });
    const body = { read: false };
    const resolutionRequest = request("not-json");
    vi.spyOn(resolutionRequest, "json").mockImplementation(async () => {
      body.read = true;
      throw new Error("invalid json");
    });

    const response = await POST(resolutionRequest, context);

    expect(response.status).toBe(403);
    expect(body.read).toBe(false);
  });

  it("checks the selected sibling action before validating its remaining fields", async () => {
    mocks.assertCapability.mockImplementation(() => {
      throw new Error("denied");
    });

    const response = await POST(
      request(JSON.stringify({ action: "VOIDED_REPLACED" })),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.assertCapability).toHaveBeenCalledWith(
      expect.anything(),
      "sales:void-replace",
    );
    expect(mocks.resolveSale).not.toHaveBeenCalled();
  });
});
