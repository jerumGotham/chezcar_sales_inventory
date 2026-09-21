import { ZodError } from "zod";
import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import { exportIdentity, pdfResponse } from "@/lib/server/export-identity";
import { createCustomerOrdersPdf } from "@/lib/server/list-pdf";
import { createCustomerOrder, customerOrderMutationSchema, CustomerSalesError, exportCustomerOrders, listCustomerOrders } from "../../../lib/server/services/customer-sales";

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: "Invalid customer order input" } }, { status: 400 });
  if (error instanceof CustomerSalesError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  return authorizationErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formats = url.searchParams.getAll("format");
    const format = formats[0] ?? null;
    if (formats.length > 1 || (format !== null && format !== "json" && format !== "pdf")) {
      return Response.json({ error: { code: "INVALID_FORMAT", message: "Customer order format must be json or pdf" } }, { status: 400 });
    }
    const actor = await requireCapability(request.headers, "customer-orders:view");

    if (format === "pdf") {
      const filters = {
        orderNo: url.searchParams.get("orderNo")?.trim() ?? "",
        customer: url.searchParams.get("customer")?.trim() ?? "",
        status: url.searchParams.get("orderStatus")?.trim() ?? "all",
        paymentStatus: url.searchParams.get("paymentStatus")?.trim() ?? "all",
      };
      const orders = await exportCustomerOrders(actor, filters);
      const body = await createCustomerOrdersPdf(
        orders.map((order) => ({
          orderNo: order.orderNo,
          orderDate: order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "Not set",
          releaseDate: order.releaseDate ? new Date(order.releaseDate).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }) : "Not set",
          branch: order.branch,
          customer: order.customer,
          salesperson: order.salesperson?.name ?? "Not recorded",
          status: order.status,
          paymentStatus: order.paymentStatus,
          itemSummary: order.itemSummary,
          totalItems: order.totalItems,
          downpayment: order.downpayment,
          totalAmount: order.totalAmount,
          balance: order.balance,
        })),
        {
          generatedBy: await exportIdentity(actor.userId),
          scope: "Authorized branches",
          appliedFilters: [
            ...(filters.orderNo ? [{ label: "Order no.", value: filters.orderNo }] : []),
            ...(filters.customer ? [{ label: "Customer", value: filters.customer }] : []),
            ...(filters.status === "all" ? [] : [{ label: "Status", value: filters.status }]),
            ...(filters.paymentStatus === "all" ? [] : [{ label: "Payment", value: filters.paymentStatus }]),
          ],
        },
      );
      return pdfResponse(body, "predator-customer-orders.pdf");
    }

    return Response.json({ data: await listCustomerOrders(actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability(request.headers, "customer-orders:create");
    const input = customerOrderMutationSchema.parse(await request.json());
    return Response.json({ data: await createCustomerOrder(actor, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
