import { updateRoleRequestSchema } from "@/lib/contracts/roles";
import {
  getRoleDefinition,
  requireOwnerRoleManager,
  rolesErrorResponse,
  updateRoleDefinition,
} from "@/lib/server/services/roles";

type RoleRouteContext = { params: Promise<{ roleId: string }> };

export async function GET(request: Request, context: RoleRouteContext) {
  try {
    await requireOwnerRoleManager(request.headers);
    const { roleId } = await context.params;
    return Response.json({ data: await getRoleDefinition(roleId) });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to load role");
  }
}

export async function PATCH(request: Request, context: RoleRouteContext) {
  try {
    await requireOwnerRoleManager(request.headers);
    const { roleId } = await context.params;
    const input = updateRoleRequestSchema.parse(await request.json());
    return Response.json({ data: await updateRoleDefinition(roleId, input) });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to update role");
  }
}
