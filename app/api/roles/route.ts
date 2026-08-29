import { createRoleRequestSchema } from "@/lib/contracts/roles";
import {
  createRoleDefinition,
  listRoleDefinitions,
  requireOwnerRoleManager,
  rolesErrorResponse,
} from "@/lib/server/services/roles";

export async function GET(request: Request) {
  try {
    await requireOwnerRoleManager(request.headers, "roles:view");
    return Response.json({ data: await listRoleDefinitions() });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to list roles");
  }
}

export async function POST(request: Request) {
  try {
    await requireOwnerRoleManager(request.headers, "roles:create");
    const input = createRoleRequestSchema.parse(await request.json());
    return Response.json({ data: await createRoleDefinition(input) }, { status: 201 });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to create role");
  }
}
