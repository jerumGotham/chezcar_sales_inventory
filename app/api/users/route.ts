import { createUserRequestSchema, userListQuerySchema } from "@/lib/contracts/users";
import { requireCapability } from "@/lib/server/authorization";
import { CAPABILITIES } from "@/lib/server/policy/access";
import {
  createStaffUser,
  listUsers,
  usersErrorResponse,
} from "@/lib/server/services/users";

export async function GET(request: Request) {
  try {
    // Authorize before parsing filters or executing protected service work.
    await requireCapability(request.headers, CAPABILITIES.usersManage);
    const query = userListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    return Response.json(await listUsers(query));
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to list users",
      invalidCode: "INVALID_QUERY",
      invalidMessage: "Invalid user list filters",
    });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, CAPABILITIES.usersManage);
    const input = createUserRequestSchema.parse(await request.json());

    return Response.json({ data: await createStaffUser(actor, input) }, { status: 201 });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to create user",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid user creation request",
    });
  }
}
