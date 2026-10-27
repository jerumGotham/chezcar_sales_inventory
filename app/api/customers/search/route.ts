import { z } from "zod";

import { authorizationErrorResponse, requireAnyCapability } from "@/lib/server/authorization";
import { prisma } from "@/lib/server/prisma";

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
});

/*
 * The customer picker on POS and Customer Orders asks here as the cashier
 * types. It used to be handed the whole list with the sale options, capped at
 * two hundred rows: the branch keyed over two hundred customers in its first
 * month, so everyone alphabetically past the cut was simply absent from the
 * dropdown, with nothing on screen saying the list was short.
 */
export async function GET(request: Request) {
  try {
    await requireAnyCapability(request.headers, [
      "customer-orders:create",
      "customer-orders:release",
      "sales:post",
      "customers:view",
    ]);
    const { q } = searchQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const customers = await prisma.customer.findMany({
      where: { status: "ACTIVE", name: q ? { contains: q, mode: "insensitive" } : undefined },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, type: true },
    });
    return Response.json({ data: { customers } });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer search" } }, { status: 400 });
    return authorizationErrorResponse(error);
  }
}
