import {
  changeOwnCredential,
  credentialActionSchema,
  getCredentialSetupRequired,
  skipCredentialSetup,
  usersErrorResponse,
} from "@/lib/server/services/users";

/**
 * Current-user first-login credential surface (D-15).
 *
 * GET reports only whether the authenticated active account still requires
 * setup. POST consumes the prompt through a narrow `action: change | skip`
 * discriminated body. Password values are never echoed in any response and
 * every failure keeps a stable `{ error: { code, message } }` envelope.
 */

export async function GET(request: Request) {
  try {
    return Response.json({
      data: await getCredentialSetupRequired(request.headers),
    });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to load credential setup state",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid credential setup request",
    });
  }
}

export async function POST(request: Request) {
  try {
    const input = credentialActionSchema.parse(await request.json());
    const data =
      input.action === "skip"
        ? await skipCredentialSetup(request.headers)
        : await changeOwnCredential(request.headers, {
            currentPassword: input.currentPassword,
            newPassword: input.newPassword,
          });

    // The submitted current/new/confirm values are never present here.
    return Response.json({ data });
  } catch (error) {
    return usersErrorResponse(error, {
      context: "Unable to update credential setup state",
      invalidCode: "INVALID_REQUEST",
      invalidMessage: "Invalid credential setup request",
    });
  }
}
