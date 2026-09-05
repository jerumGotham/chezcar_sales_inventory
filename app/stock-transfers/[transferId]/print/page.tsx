import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { loadShellAccess } from "@/lib/server/shell";
import { requireCapability } from "@/lib/server/authorization";
import { getInTransitTransferChecklist } from "@/lib/server/services/stock-transfers";

import { PrintChecklistButton } from "./print-button";
import styles from "./print.module.css";

const dispatchTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

export default async function StockTransferPrintPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const requestHeaders = await headers();
  const access = await loadShellAccess(requestHeaders);
  if (!access.authenticated) redirect("/sign-in");
  if (!access.capabilities.includes("stock-transfers:view")) {
    redirect("/access-denied");
  }

  const actor = await requireCapability(
    requestHeaders,
    "stock-transfers:view",
  );
  const { transferId } = await params;
  const checklist = await getInTransitTransferChecklist(actor, transferId);
  if (!checklist) notFound();

  return (
    <main
      className={`${styles.page} min-h-screen bg-slate-100 px-3 py-5 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:px-6 sm:py-8`}
    >
      <div className="mx-auto max-w-5xl">
        <div
          className={`${styles.screenOnly} mb-4 flex flex-wrap items-center justify-between gap-3`}
        >
          <Link
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            href={`/stock-transfers?transferId=${transferId}`}
          >
            Back to transfers
          </Link>
          <PrintChecklistButton />
        </div>

        <article
          className={`${styles.sheet} rounded-xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8`}
        >
          <header className="border-b-2 border-slate-900 pb-5 dark:border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Chezcar Auto Care
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Stock Transfer Receiving Checklist
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Use this sheet for a manual count before recording receipt in the
              system.
            </p>
          </header>

          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Transfer reference
              </dt>
              <dd className="mt-1 text-base font-semibold">
                {checklist.reference}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Dispatched at
              </dt>
              <dd className="mt-1 text-base font-semibold">
                {dispatchTimeFormatter.format(
                  new Date(checklist.dispatchedAt),
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-slate-500 dark:text-slate-400">
                Transfer route
              </dt>
              <dd className="mt-1 text-base font-semibold">
                {checklist.source.name} ({checklist.source.code}){" -> "}
                {checklist.destination.name} ({checklist.destination.code})
              </dd>
            </div>
          </dl>

          <div
            className={`${styles.tableWrap} mt-6 overflow-x-auto rounded-lg border border-slate-300 dark:border-slate-700`}
          >
            <table
              className={`${styles.table} w-full min-w-[760px] border-collapse text-sm`}
            >
              <thead>
                <tr className="bg-slate-100 text-left dark:bg-slate-800">
                  <th className="border-b border-r border-slate-300 p-3 dark:border-slate-700">
                    Item code
                  </th>
                  <th className="border-b border-r border-slate-300 p-3 dark:border-slate-700">
                    Product name
                  </th>
                  <th className="w-24 border-b border-r border-slate-300 p-3 text-center dark:border-slate-700">
                    Dispatched
                  </th>
                  <th className="w-28 border-b border-r border-slate-300 p-3 text-center dark:border-slate-700">
                    Counted
                  </th>
                  <th className="w-48 border-b border-slate-300 p-3 dark:border-slate-700">
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {checklist.lines.map((line) => (
                  <tr
                    key={line.product.itemCode}
                    className="break-inside-avoid"
                  >
                    <td className="border-r border-t border-slate-300 p-3 font-medium dark:border-slate-700">
                      {line.product.itemCode}
                    </td>
                    <td className="border-r border-t border-slate-300 p-3 dark:border-slate-700">
                      {line.product.name}
                    </td>
                    <td className="border-r border-t border-slate-300 p-3 text-center font-semibold dark:border-slate-700">
                      {line.dispatchedQuantity}
                    </td>
                    <td className="h-14 border-r border-t border-slate-300 p-3 dark:border-slate-700" />
                    <td className="h-14 border-t border-slate-300 p-3 dark:border-slate-700" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            Printing or completing this checklist does not post receipt or alter
            stock. An authorized user must record the receiving result in the
            Stock Transfers screen.
          </p>

          <section className="mt-10 grid gap-x-8 gap-y-10 text-sm sm:grid-cols-3">
            {[
              "Dispatched by",
              "Counted by",
              "Branch signoff",
            ].map((label) => (
              <div key={label}>
                <div className="h-10 border-b border-slate-900 dark:border-slate-100" />
                <p className="mt-2 font-medium">{label}</p>
                <p className="mt-3 border-b border-slate-500 pb-1 text-xs text-slate-500 dark:text-slate-400">
                  Date and time
                </p>
              </div>
            ))}
          </section>
        </article>
      </div>
    </main>
  );
}
