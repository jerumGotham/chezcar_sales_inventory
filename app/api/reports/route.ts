import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createReportPdf } from "@/lib/server/report-pdf";
import { getReport, queryFromSearchParams } from "@/lib/server/services/reports";
import { prisma } from "@/lib/server/prisma";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formats = url.searchParams.getAll("format");
    const format = formats[0] ?? null;
    if (formats.length > 1 || (format !== null && format !== "json" && format !== "pdf")) {
      return Response.json(
        { error: { code: "INVALID_FORMAT", message: "Report format must be json or pdf" } },
        { status: 400, headers: NO_STORE },
      );
    }
    const actor = await requireCapability(request.headers, format === "pdf" ? "reports:export" : "reports:view");
    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.delete("format");
    const report = await getReport(actor, queryFromSearchParams(queryParams));

    if (format === "pdf") {
      const generatedBy = await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true, email: true } });
      const displayIdentity = generatedBy ? `${generatedBy.name} (${generatedBy.email})` : actor.userId;
      const body = await createReportPdf(report, { generatedBy: displayIdentity });
      return new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename=chezcar-${report.type}-report.pdf`,
          "Content-Length": String(body.byteLength),
          "Cache-Control": "private, no-store",
        },
      });
    }
    return Response.json({ data: report }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: { code: "INVALID_FILTERS", message: error.issues[0]?.message ?? "Invalid report filters" } }, { status: 400, headers: NO_STORE });
    }
    const response = authorizationErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
