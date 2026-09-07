import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createReportPdf } from "@/lib/server/report-pdf";
import { getReport, queryFromSearchParams } from "@/lib/server/services/reports";
import { prisma } from "@/lib/server/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const actor = await requireCapability(request.headers, format === "pdf" ? "reports:export" : "reports:view");
    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.delete("format");
    const report = await getReport(actor, queryFromSearchParams(queryParams));

    if (format === "pdf") {
      const generatedBy = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } });
      const body = await createReportPdf(report, { generatedBy: generatedBy?.name ?? actor.userId });
      return new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=chezcar-${report.type}-report.pdf`,
          "Content-Length": String(body.byteLength),
          "Cache-Control": "private, no-store",
        },
      });
    }
    return Response.json({ data: report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_FILTERS", message: error.issues[0]?.message ?? "Invalid report filters" } }, { status: 400 });
    }
    return authorizationErrorResponse(error);
  }
}
