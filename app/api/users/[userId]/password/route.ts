import { resetUserPasswordRequestSchema } from "@/lib/contracts/users";
import {
  requireOwnerAdmin,
  resetStaffPassword,
  usersErrorResponse,
} from "@/lib/server/services/users";

type UserRouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: UserRouteContext) {
  try {
    const { userId } = await context.params;
    const actor = await requireOwnerAdmin(request.headers);
    const input = resetUserPasswordRequestSchema.parse(await request.json());

    // The submitted temporary password is never echoed back in any response.
    return Response.json({
      data: await resetStaffPassword(actor, request.headers, userId, input.newPassword),
    });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to reset user password",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid password reset request",
    });
  }
}
