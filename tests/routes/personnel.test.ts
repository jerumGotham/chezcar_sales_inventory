import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  listPersonnel: vi.fn(),
  createPersonnel: vi.fn(),
  updatePersonnel: vi.fn(),
  setPersonnelStatus: vi.fn(),
  personnelErrorResponse: vi.fn((error: unknown) =>
    Response.json({ error: { message: error instanceof Error ? error.message : "error" } }, { status: 400 })),
}));

vi.mock("@/lib/server/authorization", () => ({ requireCapability: mocks.requireCapability }));
vi.mock("@/lib/server/services/personnel", () => ({
  listPersonnel: mocks.listPersonnel,
  createPersonnel: mocks.createPersonnel,
  updatePersonnel: mocks.updatePersonnel,
  setPersonnelStatus: mocks.setPersonnelStatus,
  personnelErrorResponse: mocks.personnelErrorResponse,
}));

import { GET, POST } from "../../app/api/personnel/route";
import { PATCH } from "../../app/api/personnel/[personnelId]/route";
import { POST as POST_STATUS } from "../../app/api/personnel/[personnelId]/status/route";

describe("personnel routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.personnelErrorResponse.mockImplementation((error: unknown) =>
      Response.json({ error: { message: error instanceof Error ? error.message : "error" } }, { status: 400 }));
    mocks.requireCapability.mockResolvedValue({ userId: "user-1" });
  });

  it("uses exact capabilities for maintenance operations", async () => {
    mocks.listPersonnel.mockResolvedValue([]);
    mocks.createPersonnel.mockResolvedValue({ id: "personnel-1" });
    mocks.updatePersonnel.mockResolvedValue({ id: "personnel-1" });
    mocks.setPersonnelStatus.mockResolvedValue({ id: "personnel-1" });
    const context = { params: Promise.resolve({ personnelId: "personnel-1" }) };
    const body = { fullName: "Ana", locationId: "branch-1", type: "SALESPERSON" };

    await GET(new Request("http://localhost/api/personnel"));
    await POST(new Request("http://localhost/api/personnel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    await PATCH(new Request("http://localhost/api/personnel/personnel-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ fullName: "Ana R." }) }), context);
    await POST_STATUS(new Request("http://localhost/api/personnel/personnel-1/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "INACTIVE" }) }), context);

    expect(mocks.requireCapability.mock.calls.map((call) => call[1])).toEqual([
      "personnel:view",
      "personnel:create",
      "personnel:update",
      "personnel:deactivate",
    ]);
  });

  it("authorizes before parsing malformed input", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("denied"));
    await POST(new Request("http://localhost/api/personnel", { method: "POST", body: "not-json" }));
    expect(mocks.createPersonnel).not.toHaveBeenCalled();
  });
});
