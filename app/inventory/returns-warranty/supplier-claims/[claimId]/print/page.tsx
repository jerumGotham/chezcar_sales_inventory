import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { getSupplierClaim } from "@/lib/server/services/supplier-claims";

export default async function SupplierClaimPrintPage({ params }: { params: Promise<{ claimId: string }> }) {
  const actor = await requireCapability(await headers(), "supplier-claims:print").catch(() => null);
  if (!actor) redirect("/access-denied");
  const record = await getSupplierClaim(actor, (await params).claimId).catch(() => null);
  if (!record) redirect("/access-denied");
  return <main className="mx-auto max-w-5xl bg-white p-8 text-black print:max-w-none print:p-0"><h1 className="text-2xl font-bold">Chezcar Supplier Claim</h1><p className="border-b pb-4">{record.reference} · {record.status.replaceAll("_", " ")}</p><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><Info label="Supplier" value={record.supplierName} /><Info label="Location" value={`${record.locationName} (${record.locationCode})`} /><Info label="Source Receipt" value={record.sourceReceiptId ?? "Manual/Warranty claim"} /><Info label="Notes" value={record.notes ?? "-"} /></div><table className="mt-6 w-full border-collapse text-sm"><thead><tr><th className="border p-2 text-left">Item</th><th className="border p-2">Reason</th><th className="border p-2">Claimed</th><th className="border p-2">Quarantine Open</th><th className="border p-2">External Open</th></tr></thead><tbody>{record.lines.map((line) => <tr key={line.id}><td className="border p-2">{line.productItemCode} - {line.productName}</td><td className="border p-2">{line.reason}</td><td className="border p-2 text-center">{line.claimedQuantity}</td><td className="border p-2 text-center">{line.openQuarantinedQuantity}</td><td className="border p-2 text-center">{line.openMissingQuantity}</td></tr>)}</tbody></table><h2 className="mt-6 font-semibold">Refund/Credit Tracking</h2><ul className="text-sm">{record.settlements.map((item) => <li key={item.id}>{item.type}: {item.currency} {item.amount.toString()} · {item.reference}</li>)}</ul><p className="mt-8 text-xs">Claim recovery tracking only. This is not a general-ledger record. Printing has no inventory effect.</p></main>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap">{value}</p></div>; }
