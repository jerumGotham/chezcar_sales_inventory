import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

function response(status: "ok" | "unavailable", httpStatus = 200) {
  return Response.json(
    { status },
    {
      status: httpStatus,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return response("ok");
  } catch {
    return response("unavailable", 503);
  }
}
