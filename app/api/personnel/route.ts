import { createPersonnelSchema, personnelListQuerySchema } from "@/lib/contracts/personnel";
import { requireCapability } from "@/lib/server/authorization";
import {
  createPersonnel,
  listPersonnel,
  personnelErrorResponse,
} from "@/lib/server/services/personnel";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "personnel:view");
    const query = personnelListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    // Already { data, meta }: the list screen reads both.
    return Response.json(await listPersonnel(actor, query));
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
