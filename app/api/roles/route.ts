import { createRoleRequestSchema } from "@/lib/contracts/roles";
import {
  createRoleDefinition,
  listRoleDefinitions,
  requireRoleManager,
  rolesErrorResponse,
} from "@/lib/server/services/roles";

export async function GET(request: Request) {
  try {
    await requireRoleManager(request.headers, "roles:view");
    return Response.json({ data: await listRoleDefinitions() });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to list roles");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRoleManager(request.headers, "roles:create");
    const input = createRoleRequestSchema.parse(await request.json());
    return Response.json({ data: await createRoleDefinition(actor, input) }, { status: 201 });
  } catch (error) {
    return rolesErrorResponse(error, "Unable to create role");
  }
}
