import { updatePersonnelSchema } from "@/lib/contracts/personnel";
import { requireCapability } from "@/lib/server/authorization";
import {
  personnelErrorResponse,
  updatePersonnel,
} from "@/lib/server/services/personnel";

type PersonnelRouteContext = { params: Promise<{ personnelId: string }> };

export async function PATCH(request: Request, context: PersonnelRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "personnel:update");
    const { personnelId } = await context.params;
    const input = updatePersonnelSchema.parse(await request.json());
    return Response.json({ data: await updatePersonnel(actor, personnelId, input) });
  } catch (error) {
    return personnelErrorResponse(error, "Unable to update personnel");
  }
}
