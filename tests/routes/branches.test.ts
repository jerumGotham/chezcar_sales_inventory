import { beforeEach, describe, expect, it, vi } from "vitest";

const { AuthorizationError, mocks } = vi.hoisted(() => {
  class AuthorizationError extends Error {}
  return {
    AuthorizationError,
    mocks: {
      requireCapability: vi.fn(),
      listBranches: vi.fn(),
      createBranch: vi.fn(),
      updateBranch: vi.fn(),
      branchesErrorResponse: vi.fn((error: unknown) =>
        new Response(null, {
          status: error instanceof AuthorizationError ? 403 : 400,
        }),
      ),
    },
  };
});

vi.mock("@/lib/server/authorization", () => ({
  AuthorizationError,
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/server/services/branches", () => ({
  listBranches: mocks.listBranches,
  createBranch: mocks.createBranch,
  updateBranch: mocks.updateBranch,
  branchesErrorResponse: mocks.branchesErrorResponse,
}));
vi.mock("@/lib/contracts/branches", async () =>
  import("../../lib/contracts/branches"),
);

import { GET, POST } from "../../app/api/branches/route";
import { PATCH } from "../../app/api/branches/[branchId]/route";

describe("branch maintenance routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    mocks.requireCapability.mockResolvedValue({ role: "ADMIN", isOwner: true });
  });

  it("authorizes before listing branches", async () => {
    mocks.listBranches.mockResolvedValue([]);
    const response = await GET(new Request("http://localhost/api/branches"));

    expect(response.status).toBe(200);
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      expect.any(Headers),
      "branches:manage",
    );
    expect(mocks.listBranches).toHaveBeenCalledOnce();
  });

  it("normalizes new branch codes before calling the service", async () => {
    mocks.createBranch.mockResolvedValue({ id: "branch-dv", code: "DV" });
    const response = await POST(
      new Request("http://localhost/api/branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "dv", name: "Davao City" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createBranch).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DV", name: "Davao City" }),
    );
  });

  it("strips code from PATCH so persisted codes cannot change", async () => {
    mocks.updateBranch.mockResolvedValue({ id: "branch-dv", code: "DV" });
    const response = await PATCH(
      new Request("http://localhost/api/branches/branch-dv", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "XX", name: "Davao" }),
      }),
      { params: Promise.resolve({ branchId: "branch-dv" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateBranch).toHaveBeenCalledWith("branch-dv", {
      name: "Davao",
    });
  });

  it("does not parse or create when authorization fails", async () => {
    mocks.requireCapability.mockRejectedValue(new Error("denied"));
    await POST(
      new Request("http://localhost/api/branches", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(mocks.createBranch).not.toHaveBeenCalled();
    expect(mocks.branchesErrorResponse).toHaveBeenCalled();
  });

  it("does not list branches for a non-owner with the capability", async () => {
    mocks.requireCapability.mockResolvedValue({
      role: "BRANCH_STAFF",
      isOwner: false,
    });

    const response = await GET(new Request("http://localhost/api/branches"));

    expect(response.status).toBe(403);
    expect(mocks.listBranches).not.toHaveBeenCalled();
    expect(mocks.branchesErrorResponse).toHaveBeenCalled();
  });
});
