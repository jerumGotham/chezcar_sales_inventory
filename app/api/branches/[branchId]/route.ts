import { updateBranchSchema } from "@/lib/contracts/branches";
import { AuthorizationError, requireCapability } from "@/lib/server/authorization";
import {
  branchesErrorResponse,
  updateBranch,
} from "@/lib/server/services/branches";

type BranchRouteContext = { params: Promise<{ branchId: string }> };

export async function PATCH(request: Request, context: BranchRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "branches:manage");
    if (!actor.isOwner) throw new AuthorizationError("Insufficient permissions");
    const { branchId } = await context.params;
    const input = updateBranchSchema.parse(await request.json());
    return Response.json({ data: await updateBranch(branchId, input) });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to update branch");
  }
}
