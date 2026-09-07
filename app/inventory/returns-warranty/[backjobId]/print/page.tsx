import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCapability } from "@/lib/server/authorization";
import { getBackjob } from "@/lib/server/services/backjobs";

export default async function BackjobPrintPage({ params }: { params: Promise<{ backjobId: string }> }) {
  const actor = await requireCapability(await headers(), "backjobs:print").catch(() => null);
  if (!actor) redirect("/access-denied");
  const record = await getBackjob(actor, (await params).backjobId).catch(() => null);
  if (!record) redirect("/access-denied");

  return <main className="mx-auto max-w-4xl bg-white p-8 text-black print:max-w-none print:p-0">
    <div className="mb-8 flex items-start justify-between border-b pb-5"><div><h1 className="text-2xl font-bold">Chezcar Backjob Service Record</h1><p>{record.reference}</p></div><div className="text-right text-sm"><strong>{record.status.replaceAll("_", " ")}</strong><p>{record.locationName} ({record.locationCode})</p></div></div>
    <section className="grid gap-4 text-sm sm:grid-cols-2"><Info label="Customer" value={record.customerName} /><Info label="Installer" value={record.installerName ?? "Not assigned"} /><Info label="Original Receipt" value={record.originalReceiptNumber ?? record.legacyReference ?? "Legacy"} /><Info label="Schedule" value={record.scheduledFor ? new Date(record.scheduledFor).toLocaleString("en-PH") : "Not scheduled"} /><Info label="Product/Service" value={record.affectedProductName ?? record.legacyProductDescription ?? "Not recorded"} /><Info label="Coverage" value={record.coverage} /><div className="sm:col-span-2"><Info label="Concern" value={record.concern} /></div><div className="sm:col-span-2"><Info label="Work Performed" value={record.workPerformed ?? "Pending"} /></div></section>
    <h2 className="mb-2 mt-8 font-semibold">Parts</h2><table className="w-full border-collapse text-sm"><thead><tr><th className="border p-2 text-left">Item</th><th className="border p-2">Planned</th><th className="border p-2">Issued</th><th className="border p-2">Used</th><th className="border p-2">Returned</th></tr></thead><tbody>{record.parts.length ? record.parts.map((part) => <tr key={part.id}><td className="border p-2">{part.productItemCode} - {part.productName}</td><td className="border p-2 text-center">{part.plannedQuantity}</td><td className="border p-2 text-center">{part.issuedQuantity}</td><td className="border p-2 text-center">{part.usedQuantity ?? "-"}</td><td className="border p-2 text-center">{part.returnedQuantity}</td></tr>) : <tr><td className="border p-3" colSpan={5}>No parts used.</td></tr>}</tbody></table>
    <div className="mt-12 grid grid-cols-2 gap-12 text-center text-sm"><div className="border-t pt-2">Customer acknowledgement</div><div className="border-t pt-2">Authorized staff</div></div><p className="mt-8 text-xs text-slate-600">Service record only. This is not a sales receipt. Printed {new Date().toLocaleString("en-PH")}.</p>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap">{value}</p></div>;
}
