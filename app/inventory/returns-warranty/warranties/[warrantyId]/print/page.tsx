import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { getCustomerWarranty } from "@/lib/server/services/customer-warranties";

export default async function WarrantyPrintPage({ params }: { params: Promise<{ warrantyId: string }> }) {
  const actor = await requireCapability(await headers(), "customer-warranties:print").catch(() => null);
  if (!actor) redirect("/access-denied");
  const record = await getCustomerWarranty(actor, (await params).warrantyId).catch(() => null);
  if (!record) redirect("/access-denied");
  return <main className="mx-auto max-w-4xl bg-white p-8 text-black print:max-w-none print:p-0"><h1 className="text-2xl font-bold">Chezcar Customer Warranty Claim</h1><p className="border-b pb-4">{record.reference} · {record.status.replaceAll("_", " ")}</p><div className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><Info label="Customer" value={record.customerName} /><Info label="Branch" value={`${record.locationName} (${record.locationCode})`} /><Info label="Original Receipt" value={record.receiptNumber ?? record.legacySaleReference ?? "Legacy"} /><Info label="Product" value={`${record.productItemCode} - ${record.productName}`} /><Info label="Claim Quantity" value={String(record.claimQuantity)} /><Info label="Received to Quarantine" value={String(record.receivedQuantity)} /><Info label="Resolution" value={record.resolution ?? "Pending assessment"} /><Info label="Warranty Expiry" value={record.warrantyExpiresAt ? new Date(record.warrantyExpiresAt).toLocaleDateString("en-PH") : "Admin assessment required"} /><div className="sm:col-span-2"><Info label="Concern" value={record.concern} /></div><div className="sm:col-span-2"><Info label="Assessment" value={record.assessmentNotes ?? "Pending"} /></div></div><div className="mt-14 grid grid-cols-2 gap-12 text-center text-sm"><div className="border-t pt-2">Customer</div><div className="border-t pt-2">Authorized approver</div></div><p className="mt-8 text-xs">Claim detail only. Printing has no inventory effect.</p></main>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap">{value}</p></div>; }
