import "server-only";

import { prisma } from "@/lib/server/prisma";

/** "Name (email)" for the PDF preamble, falling back to the opaque user id. */
export async function exportIdentity(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return user ? `${user.name} (${user.email})` : userId;
}

/** PDF responses are private downloads; never cache them. */
export function pdfResponse(body: ArrayBuffer, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
