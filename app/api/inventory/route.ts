import { ZodError } from "zod";

import {
  authorizationErrorResponse,
  requireCapability,
} from "@/lib/server/authorization";
import {
  listInventory,
  parseInventoryListQuery,
} from "@/lib/server/catalog";
import { exportIdentity, pdfResponse } from "@/lib/server/export-identity";
import { createInventoryListPdf } from "@/lib/server/list-pdf";

// A PDF copy covers every filtered row, not the page on screen. The cap keeps
// one request bounded; a wider pull belongs in Reports.
const EXPORT_ROW_LIMIT = 5000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const formats = url.searchParams.getAll("format");
    const format = formats[0] ?? null;
    if (formats.length > 1 || (format !== null && format !== "json" && format !== "pdf")) {
      return Response.json(
        { error: { code: "INVALID_FORMAT", message: "Inventory format must be json or pdf" } },
        { status: 400 },
      );
    }
    const user = await requireCapability(request.headers, "inventory:view");
    const queryParams = new URLSearchParams(url.searchParams);
    queryParams.delete("format");
    const query = parseInventoryListQuery(queryParams);

    if (format === "pdf") {
      const inventory = await listInventory({ ...query, page: 1, pageSize: EXPORT_ROW_LIMIT }, user);
      const body = await createInventoryListPdf(inventory, {
        generatedBy: await exportIdentity(user.userId),
        scope: query.location === "all" ? "All authorized locations" : query.location,
        appliedFilters: [
          ...(query.itemCode ? [{ label: "Item code", value: query.itemCode }] : []),
          ...(query.name ? [{ label: "Product", value: query.name }] : []),
          ...(query.category === "all" ? [] : [{ label: "Category", value: query.category }]),
          ...(query.location === "all" ? [] : [{ label: "Location", value: query.location }]),
          ...(query.status === "all" ? [] : [{ label: "Status", value: query.status }]),
        ],
      });
      return pdfResponse(body, "chezcar-inventory-list.pdf");
    }

    return Response.json(await listInventory(query, user));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: { code: "INVALID_QUERY", message: "Invalid inventory filters" } },
        { status: 400 },
      );
    }

    try {
      return authorizationErrorResponse(error);
    } catch (unexpectedError) {
      console.error("Unable to list inventory", unexpectedError);
      return Response.json(
        { error: { code: "INTERNAL_ERROR", message: "Unable to load inventory" } },
        { status: 500 },
      );
    }
  }
}
