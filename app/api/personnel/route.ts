import { createPersonnelSchema } from "@/lib/contracts/personnel";
import { requireCapability } from "@/lib/server/authorization";
import {
  createPersonnel,
  listPersonnel,
  personnelErrorResponse,
} from "@/lib/server/services/personnel";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "personnel:view");
    return Response.json({ data: await listPersonnel(actor) });
  } catch (error) {
    return personnelErrorResponse(error, "Unable to list personnel");
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "personnel:create");
    const input = createPersonnelSchema.parse(await request.json());
    return Response.json({ data: await createPersonnel(actor, input) }, { status: 201 });
  } catch (error) {
    return personnelErrorResponse(error, "Unable to create personnel");
  }
}
