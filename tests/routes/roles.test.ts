import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwnerRoleManager: vi.fn(),
  listRoleDefinitions: vi.fn(),
  getRoleDefinition: vi.fn(),
  createRoleDefinition: vi.fn(),
  updateRoleDefinition: vi.fn(),
  rolesErrorResponse: vi.fn(() => new Response(null, { status: 400 })),
}));

vi.mock("@/lib/server/services/roles", () => mocks);
vi.mock("@/lib/contracts/roles", async () => import("../../lib/contracts/roles"));

import { GET as listRoles, POST as createRole } from "../../app/api/roles/route";
import { GET as getRole, PATCH as updateRole } from "../../app/api/roles/[roleId]/route";

describe("role maintenance routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.requireOwnerRoleManager.mockResolvedValue({ isOwner: true });
    mocks.rolesErrorResponse.mockReturnValue(new Response(null, { status: 400 }));
  });

  it("authorizes before reading role data", async () => {
    mocks.listRoleDefinitions.mockResolvedValue([]);
    await listRoles(new Request("http://localhost/api/roles"));
    expect(mocks.requireOwnerRoleManager).toHaveBeenCalledWith(
      expect.any(Headers),
      "roles:view",
    );
    expect(mocks.listRoleDefinitions).toHaveBeenCalledOnce();

    mocks.getRoleDefinition.mockResolvedValue({ id: "role-1" });
    await getRole(new Request("http://localhost/api/roles/role-1"), {
      params: Promise.resolve({ roleId: "role-1" }),
    });
    expect(mocks.getRoleDefinition).toHaveBeenCalledWith("role-1");
  });

  it("validates create and update requests before service writes", async () => {
    mocks.createRoleDefinition.mockResolvedValue({ id: "role-1" });
    const created = await createRole(
      new Request("http://localhost/api/roles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Cashier",
          description: "Branch sales",
          scope: "BRANCH",
          permissions: ["sales:post"],
        }),
      }),
    );
    expect(created.status).toBe(201);
    expect(mocks.createRoleDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cashier", scope: "BRANCH" }),
    );

    mocks.updateRoleDefinition.mockResolvedValue({ id: "role-1", version: 2 });
    await updateRole(
      new Request("http://localhost/api/roles/role-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, permissions: ["dashboard:view"] }),
      }),
      { params: Promise.resolve({ roleId: "role-1" }) },
    );
    expect(mocks.updateRoleDefinition).toHaveBeenCalledWith(
      "role-1",
      { version: 1, permissions: ["dashboard:view"] },
    );
  });

  it("does not parse hostile input after owner authorization fails", async () => {
    mocks.requireOwnerRoleManager.mockRejectedValue(new Error("denied"));
    await createRole(
      new Request("http://localhost/api/roles", { method: "POST", body: "not-json" }),
    );
    expect(mocks.createRoleDefinition).not.toHaveBeenCalled();
    expect(mocks.rolesErrorResponse).toHaveBeenCalled();
  });
});
