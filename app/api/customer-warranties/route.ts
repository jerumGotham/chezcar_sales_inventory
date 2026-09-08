import { ZodError } from "zod";

import { warrantyCreateFieldsSchema, warrantyCreatePhotoSchema, warrantyListQuerySchema } from "@/lib/contracts/customer-warranties";
import { authorizationErrorResponse, requireCapability } from "@/lib/server/authorization";
import type { Capability } from "@/lib/server/policy/access";
import { createCustomerWarranty, CustomerWarrantyError, listCustomerWarranties } from "@/lib/server/services/customer-warranties";
import { removeWarrantyEvidence, saveWarrantyEvidence } from "@/lib/server/services/warranty-evidence";

const viewCapability = "customer-warranties:view" as Capability;
const createCapability = "customer-warranties:create" as Capability;

function errorResponse(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid warranty input" } }, { status: 400 });
  if (error instanceof CustomerWarrantyError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof Error && error.message.startsWith("Warranty evidence")) return Response.json({ error: { code: "INVALID_INPUT", message: error.message } }, { status: 400 });
  try { return authorizationErrorResponse(error); } catch (unexpected) { console.error("Customer warranty request failed", unexpected); return Response.json({ error: { code: "INTERNAL_ERROR", message: "Unable to process warranty" } }, { status: 500 }); }
}

export async function GET(request: Request) {
  try {
    const actor = await requireCapability(request.headers, viewCapability);
    const params = new URL(request.url).searchParams;
    const query = warrantyListQuerySchema.parse({ page: params.get("page") ?? undefined, pageSize: params.get("pageSize") ?? undefined, status: params.get("status") ?? undefined });
    return Response.json(await listCustomerWarranties(actor, query));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  let savedKey: string | undefined;
  try {
    const actor = await requireCapability(request.headers, createCapability);
    const form = await request.formData();
    const photo = warrantyCreatePhotoSchema.parse(form.get("photo"));
    const fields = warrantyCreateFieldsSchema.parse(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")));
    const evidence = photo ? await saveWarrantyEvidence(photo) : null;
    savedKey = evidence?.key;
    const result = await createCustomerWarranty(actor, fields, evidence);
    if (evidence && !result.evidenceUsed) await removeWarrantyEvidence(evidence.key);
    savedKey = undefined;
    return Response.json({ data: result.warranty }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (savedKey) await removeWarrantyEvidence(savedKey).catch((cleanupError) => console.error("Unable to clean up warranty evidence", cleanupError));
    return errorResponse(error);
  }
}
