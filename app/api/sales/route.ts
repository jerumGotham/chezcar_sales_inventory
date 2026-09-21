import { ZodError } from "zod";

import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import { exportIdentity, pdfResponse } from "@/lib/server/export-identity";
import { createDirectSalesPdf } from "@/lib/server/list-pdf";
import { createDirectSale, CustomerSalesError, directSaleSchema, exportDirectSales, getDirectSalesOverview, listSales } from "../../../lib/server/services/customer-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid sale input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formats = url.searchParams.getAll("format");
    const format = formats[0] ?? null;
    if (formats.length > 1 || (format !== null && format !== "json" && format !== "pdf")) {
      return Response.json({ error: { code: "INVALID_FORMAT", message: "Sales format must be json or pdf" } }, { status: 400 });
    }
    const actor = await requireCapability(request.headers, "sales:view");

    if (format === "pdf") {
      const search = url.searchParams.get("search")?.trim() ?? "";
      const sales = await exportDirectSales(actor, { search });
      const body = await createDirectSalesPdf(
        sales.map((sale) => ({
          reference: sale.reference,
          manualReceiptNumber: sale.manualReceiptNumber,
          postedAt: sale.postedAt,
          branch: sale.branch,
          customer: sale.customer,
          salesperson: sale.salesperson?.name ?? "Not recorded",
          encoder: sale.postedBy,
          paymentMethod: sale.paymentMethod,
          reviewStatus: sale.reviewStatus,
          units: sale.lines.reduce((sum, line) => sum + line.quantity, 0),
          discountAmount: sale.discountAmount,
          totalAmount: sale.totalAmount,
          amountPaid: sale.amountPaid,
        })),
        {
          generatedBy: await exportIdentity(actor.userId),
          scope: "Authorized branches",
          appliedFilters: search ? [{ label: "Search", value: search }] : [],
        },
      );
      return pdfResponse(body, "predator-direct-sales.pdf");
    }

    if (url.searchParams.get("source") === "direct") {
      return Response.json(await getDirectSalesOverview(actor));
    }
    return Response.json({ data: await listSales(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "sales:post");
    return Response.json({ data: await createDirectSale(actor, directSaleSchema.parse(await request.json())) });
  } catch (error) {
    return errorResponse(error);
  }
}
