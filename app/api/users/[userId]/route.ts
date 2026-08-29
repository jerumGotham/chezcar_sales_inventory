import { updateUserRequestSchema } from "@/lib/contracts/users";
import { requireOwnerAdmin, updateStaffUser, usersErrorResponse } from "@/lib/server/services/users";

type UserRouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: UserRouteContext) {
  try {
    const { userId } = await context.params;
    const actor = await requireOwnerAdmin(request.headers, "users:update");
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
