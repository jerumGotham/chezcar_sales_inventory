import { updateUserRequestSchema } from "@/lib/contracts/users";
import { requireCapability } from "@/lib/server/authorization";
import { CAPABILITIES } from "@/lib/server/policy/access";
import { updateStaffUser, usersErrorResponse } from "@/lib/server/services/users";

type UserRouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: UserRouteContext) {
  try {
    const { userId } = await context.params;
    const actor = await requireCapability(request.headers, CAPABILITIES.usersManage);
    const input = updateUserRequestSchema.parse(await request.json());

    return Response.json({ data: await updateStaffUser(actor, userId, input) });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to update user",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid user update request",
    });
  }
}
