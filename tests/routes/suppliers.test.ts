import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  listSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  updateSupplier: vi.fn(),
  setSupplierStatus: vi.fn(),
  suppliersErrorResponse: vi.fn((error: unknown) =>
    Response.json({ error: { message: error instanceof Error ? error.message : "error" } }, { status: 400 })),
}));

vi.mock("@/lib/server/authorization", () => ({ requireCapability: mocks.requireCapability }));
vi.mock("@/lib/server/services/suppliers", () => ({
  listSuppliers: mocks.listSuppliers,
  createSupplier: mocks.createSupplier,
  updateSupplier: mocks.updateSupplier,
  setSupplierStatus: mocks.setSupplierStatus,
  suppliersErrorResponse: mocks.suppliersErrorResponse,
}));

import { GET, POST } from "../../app/api/suppliers/route";
import { PATCH } from "../../app/api/suppliers/[supplierId]/route";
import { POST as POST_STATUS } from "../../app/api/suppliers/[supplierId]/status/route";

describe("supplier routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.suppliersErrorResponse.mockImplementation((error: unknown) =>
      Response.json({ error: { message: error instanceof Error ? error.message : "error" } }, { status: 400 }));
    mocks.requireCapability.mockResolvedValue({ userId: "user-1" });
  });

  it("uses exact capabilities for list and create", async () => {
    mocks.listSuppliers.mockResolvedValue([]);
    mocks.createSupplier.mockResolvedValue({ id: "supplier-1" });
    await GET(new Request("http://localhost/api/suppliers"));
    await POST(new Request("http://localhost/api/suppliers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme" }),
    }));
    expect(mocks.requireCapability).toHaveBeenNthCalledWith(1, expect.any(Headers), "suppliers:view");
    expect(mocks.requireCapability).toHaveBeenNthCalledWith(2, expect.any(Headers), "suppliers:create");
  });

  it("uses exact capabilities for update and lifecycle status", async () => {
    mocks.updateSupplier.mockResolvedValue({ id: "supplier-1" });
    mocks.setSupplierStatus.mockResolvedValue({ id: "supplier-1", status: "INACTIVE" });
    const context = { params: Promise.resolve({ supplierId: "supplier-1" }) };
    await PATCH(new Request("http://localhost/api/suppliers/supplier-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme Trading" }),
    }), context);
    await POST_STATUS(new Request("http://localhost/api/suppliers/supplier-1/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "INACTIVE" }),
    }), context);
    expect(mocks.requireCapability).toHaveBeenNthCalledWith(1, expect.any(Headers), "suppliers:update");
    expect(mocks.requireCapability).toHaveBeenNthCalledWith(2, expect.any(Headers), "suppliers:deactivate");
  });

  it("authorizes before parsing malformed input", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("denied"));
    await POST(new Request("http://localhost/api/suppliers", { method: "POST", body: "not-json" }));
    expect(mocks.createSupplier).not.toHaveBeenCalled();
  });
});
