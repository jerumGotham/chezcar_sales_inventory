import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { createReportsPdf } from "@/lib/server/report-pdf";
import { getReportsSummary } from "../../../lib/server/services/customer-sales";

export async function GET(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    const actor = await requireCapability(
      request.headers,
      format === "pdf" ? "reports:export" : "reports:view",
    );
    const summary = await getReportsSummary(actor);

    if (format === "pdf") {
      const body = await createReportsPdf(summary, {
        generatedAt: new Date(),
        generatedBy: actor.userId,
      });

      return new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=chezcar-report.pdf",
          "Content-Length": String(body.byteLength),
          "Cache-Control": "private, no-store",
        },
      });
    }

    return Response.json({ data: summary });
  } catch (error) {
    return authorizationErrorResponse(error);
  }
}
