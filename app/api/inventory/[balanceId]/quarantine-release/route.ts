import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { quarantineReleaseSchema } from "@/lib/contracts/refunds";
import { releaseQuarantinedStock, RefundError } from "@/lib/server/services/refunds";

type Context = { params: Promise<{ balanceId: string }> };

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid release input" } },
      { status: 400 },
    );
  }
  if (error instanceof RefundError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  return authorizationErrorResponse(error);
}

/** The way back out of quarantine: units are sellable again. */
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireCapability(request.headers, "inventory:quarantine-release");
    const { balanceId } = await context.params;
    const input = quarantineReleaseSchema.parse(await request.json());
    return Response.json({ data: await releaseQuarantinedStock(actor, balanceId, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
