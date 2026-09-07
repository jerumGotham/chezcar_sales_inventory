import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireCapability: vi.fn(), list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/server/authorization", () => ({ requireCapability: mocks.requireCapability, authorizationErrorResponse: vi.fn() }));
vi.mock("@/lib/server/services/supplier-claims", () => ({ SupplierClaimError: class SupplierClaimError extends Error {}, listSupplierClaims: mocks.list, createSupplierClaim: mocks.create }));
import { GET, POST } from "../../app/api/supplier-claims/route";

describe("supplier claim collection route", () => {
  beforeEach(() => { mocks.requireCapability.mockReset(); mocks.list.mockReset(); mocks.create.mockReset(); mocks.requireCapability.mockResolvedValue({}); });
  it("uses the supplier-claim view capability for location-scoped listing", async () => { mocks.list.mockResolvedValue({ data: [], meta: { total: 0 } }); expect((await GET(new Request("http://localhost/api/supplier-claims"))).status).toBe(200); expect(mocks.requireCapability).toHaveBeenCalledWith(expect.any(Headers), "supplier-claims:view"); });
  it("rejects an invalid create payload before service mutation", async () => { const response = await POST(new Request("http://localhost/api/supplier-claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })); expect(response.status).toBe(400); expect(mocks.create).not.toHaveBeenCalled(); });
});
