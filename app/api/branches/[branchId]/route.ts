import { updateBranchSchema } from "@/lib/contracts/branches";
import { requireCapability } from "@/lib/server/authorization";
import {
  branchesErrorResponse,
  updateBranch,
} from "@/lib/server/services/branches";

type BranchRouteContext = { params: Promise<{ branchId: string }> };

export async function PATCH(request: Request, context: BranchRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "branches:update");
    const { branchId } = await context.params;
    const input = updateBranchSchema.parse(await request.json());
    return Response.json({ data: await updateBranch(actor, branchId, input) });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to update branch");
  }
}
