import { personnelStatusRequestSchema } from "@/lib/contracts/personnel";
import { requireCapability } from "@/lib/server/authorization";
import {
  personnelErrorResponse,
  setPersonnelStatus,
} from "@/lib/server/services/personnel";

type PersonnelRouteContext = { params: Promise<{ personnelId: string }> };

export async function POST(request: Request, context: PersonnelRouteContext) {
  try {
    const actor = await requireCapability(request.headers, "personnel:deactivate");
    const { personnelId } = await context.params;
    const input = personnelStatusRequestSchema.parse(await request.json());
    return Response.json({ data: await setPersonnelStatus(actor, personnelId, input) });
  } catch (error) {
    return personnelErrorResponse(error, "Unable to change personnel status");
  }
}
