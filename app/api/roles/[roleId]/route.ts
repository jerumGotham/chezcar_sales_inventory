import { deleteRoleRequestSchema, updateRoleRequestSchema } from "@/lib/contracts/roles";
import {
  deleteRoleDefinition,
  getRoleDefinition,
  requireRoleManager,
  rolesErrorResponse,
  updateRoleDefinition,
} from "@/lib/server/services/roles";

type RoleRouteContext = { params: Promise<{ roleId: string }> };

export async function GET(request: Request, context: RoleRouteContext) {
  try {
    await requireRoleManager(request.headers, "roles:view");
    const { roleId } = await context.params;
    return Response.json({ data: await getRoleDefinition(roleId) });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to load role");
  }
}

export async function PATCH(request: Request, context: RoleRouteContext) {
  try {
    const actor = await requireRoleManager(request.headers, "roles:update");
    const { roleId } = await context.params;
    const input = updateRoleRequestSchema.parse(await request.json());
    return Response.json({ data: await updateRoleDefinition(actor, roleId, input) });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to update role");
  }
}

export async function DELETE(request: Request, context: RoleRouteContext) {
  try {
    const actor = await requireRoleManager(request.headers, "roles:delete");
    const { roleId } = await context.params;
    const input = deleteRoleRequestSchema.parse(await request.json());
    return Response.json({ data: await deleteRoleDefinition(actor, roleId, input) });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to delete role");
  }
}
