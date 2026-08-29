import { createBranchSchema } from "@/lib/contracts/branches";
import { requireCapability } from "@/lib/server/authorization";
import {
  branchesErrorResponse,
  createBranch,
  listBranches,
} from "@/lib/server/services/branches";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "branches:view");
    return Response.json({ data: await listBranches(actor) });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to list branches");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "branches:create");
    const input = createBranchSchema.parse(await request.json());
    return Response.json({ data: await createBranch(actor, input) }, { status: 201 });
  } catch (error) {
    return branchesErrorResponse(error, "Unable to create branch");
  }
}
