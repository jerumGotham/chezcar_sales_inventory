import { userStatusRequestSchema } from "@/lib/contracts/users";
import { requireOwnerAdmin, setStaffStatus, usersErrorResponse } from "@/lib/server/services/users";

type UserRouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: UserRouteContext) {
  try {
    const { userId } = await context.params;
    const actor = await requireOwnerAdmin(request.headers);
    const input = userStatusRequestSchema.parse(await request.json());

    return Response.json({
      data: await setStaffStatus(actor, userId, input.status),
    });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to change user status",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid user status request",
    });
  }
}
