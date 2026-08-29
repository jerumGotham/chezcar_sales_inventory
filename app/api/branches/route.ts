import { createBranchSchema } from "@/lib/contracts/branches";
import { AuthorizationError, requireCapability } from "@/lib/server/authorization";
import {
  branchesErrorResponse,
  createBranch,
  listBranches,
} from "@/lib/server/services/branches";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "branches:view");
    if (!actor.isOwner) throw new AuthorizationError("Insufficient permissions");
    return Response.json({ data: await listBranches() });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to list branches");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "branches:create");
    if (!actor.isOwner) throw new AuthorizationError("Insufficient permissions");
    const input = createBranchSchema.parse(await request.json());
    return Response.json({ data: await createBranch(input) }, { status: 201 });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to create branch");
  }
}
