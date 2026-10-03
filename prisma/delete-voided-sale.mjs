import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

/**
 * Removes a voided sale and everything hanging off it.
 *
 * The application has no way to do this, deliberately: a sale that was posted
 * moved stock and recorded money, and voiding it is how that is undone while
 * leaving the account of what happened. Deleting the row removes that account
 * too, so this exists for the case where a receipt should never have been in
 * the database at all.
 *
 * It will only touch a VOIDED sale. A posted one is live money and is refused
 * outright. It also refuses a sale that another record of its own stands on --
 * a refund, a customer warranty, a backjob, or the replacement sale that
 * records this one as what it replaced -- because deleting the row would leave
 * that record describing nothing.
 *
 * Reports only unless --apply is given, so the first run always shows what
 * would go.
 *
 *   export DATABASE_URL='postgresql://<user>:<password>@<host>:<port>/<database>'
 *   export ALLOW_SALE_DELETE=true
 *   node prisma/delete-voided-sale.mjs --host=<hostname> --receipt=2738
 *   node prisma/delete-voided-sale.mjs --host=<hostname> --receipt=2738 --apply
 */

function flag(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/** The host is typed out and has to match, the way the transaction reset does. */
export function assertTarget(databaseUrl, expectedHost, allow) {
  if (allow !== "true") throw new Error("ALLOW_SALE_DELETE=true is required");
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (!expectedHost) throw new Error('Pass --host=<hostname>, the host this is meant to change');

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a URL");
  }
  if (parsed.hostname !== expectedHost) {
    throw new Error(
      `Refusing: DATABASE_URL points at ${parsed.hostname}, not the ${expectedHost} given with --host`,
    );
  }
  return { host: parsed.hostname, database: decodeURIComponent(parsed.pathname.slice(1)) };
}

export async function deleteVoidedSale(prisma, receiptNumber, { apply = false } = {}) {
  const sale = await prisma.sale.findFirst({
    where: { manualReceiptNumber: receiptNumber },
    select: {
      id: true, reference: true, manualReceiptNumber: true, status: true,
      totalAmount: true, correctionOfId: true, postedAt: true,
      location: { select: { code: true, name: true } },
      accountingReview: { select: { receiptPhotoKey: true } },
      corrections: { select: { reference: true, manualReceiptNumber: true } },
      _count: {
        select: {
          lines: true, refunds: true, warranties: true,
          originalBackjobs: true, chargeBackjobs: true,
        },
      },
    },
  });

  if (!sale) {
    return { found: false, receiptNumber };
  }

  const result = {
    found: true,
    sale: {
      id: sale.id,
      reference: sale.reference,
      receiptNumber: sale.manualReceiptNumber,
      status: sale.status,
      branch: `${sale.location.code} - ${sale.location.name}`,
      totalAmount: sale.totalAmount.toNumber(),
      postedAt: sale.postedAt.toISOString(),
      lines: sale._count.lines,
    },
    applied: apply,
    deleted: false,
  };

  // Live money. Void it through the application first, which restores the
  // stock; only then is there nothing left for this to break.
  if (sale.status !== "VOIDED") {
    result.refused = `This sale is ${sale.status}, not VOIDED. Only a voided sale can be removed.`;
    return result;
  }
  /*
   * Everything below stands on this sale with a Restrict foreign key and is a
   * record in its own right. The database would refuse the delete anyway; this
   * says which one, and in words.
   */
  const standingOn = [
    [sale._count.refunds, "refund(s), which record money handed back against it"],
    [sale._count.warranties, "customer warranty case(s) raised against it"],
    [sale._count.originalBackjobs, "backjob(s) that name it as the original sale"],
    [sale._count.chargeBackjobs, "backjob(s) charged to it"],
  ];
  for (const [count, description] of standingOn) {
    if (count > 0) {
      result.refused = `${count} ${description}. Deleting this sale would leave them describing nothing.`;
      return result;
    }
  }
  if (sale.corrections.length > 0) {
    /*
     * This sale was voided and replaced, and the replacement is a live posted
     * sale that records this one as what it corrected. Clearing that link to
     * force the delete through would quietly rewrite the replacement's history,
     * which is not this script's call to make.
     */
    const names = sale.corrections.map((other) => `${other.reference} (receipt ${other.manualReceiptNumber})`);
    result.refused =
      `The replacement sale ${names.join(", ")} records this one as what it replaced. ` +
      "Deleting this sale would cut that link out of the replacement's history, so decide that deliberately first.";
    result.replacedBy = names;
    return result;
  }

  if (sale.correctionOfId) {
    // Worth saying: the earlier sale this one replaced is left with no
    // replacement on record once this row is gone.
    result.note = `This sale replaced an earlier one (${sale.correctionOfId}), which will be left with nothing recorded as its replacement.`;
  }
  if (sale.accountingReview?.receiptPhotoKey) {
    // The image is on the server's disk, out of this script's reach.
    result.orphanedEvidenceFile = sale.accountingReview.receiptPhotoKey;
  }

  if (!apply) {
    result.wouldDelete = true;
    return result;
  }

  const removed = await prisma.$transaction(async (tx) => {
    /*
     * SaleSalespersonEvent refuses its own deletion through a trigger. The
     * trigger reads this setting and steps aside for a reset rather than being
     * disabled, so it stays armed against every other connection meanwhile.
     */
    await tx.$executeRaw`SELECT set_config('chezcar.operational_data_reset', 'true', true)`;
    const counts = {};
    counts.correctionRequests = (await tx.saleCorrectionRequest.deleteMany({ where: { saleId: sale.id } })).count;
    counts.salespersonEvents = (await tx.saleSalespersonEvent.deleteMany({ where: { saleId: sale.id } })).count;
    counts.accountingReview = (await tx.saleAccountingReview.deleteMany({ where: { saleId: sale.id } })).count;
    counts.lines = (await tx.saleLine.deleteMany({ where: { saleId: sale.id } })).count;
    counts.payments = (await tx.payment.deleteMany({ where: { saleId: sale.id } })).count;
    // The registry holds the number itself; left behind, it stays taken.
    counts.manualReceipts = (await tx.manualReceipt.deleteMany({ where: { saleId: sale.id } })).count;
    await tx.sale.delete({ where: { id: sale.id } });
    return counts;
  });

  result.deleted = true;
  result.removed = removed;
  /*
   * Stock movements are left alone. They record stock that moved and was put
   * back, which happened, and they carry the reference as text rather than a
   * link, so nothing is left pointing at a row that is gone.
   */
  return result;
}

async function main() {
  const target = assertTarget(process.env.DATABASE_URL, flag("host"), process.env.ALLOW_SALE_DELETE);
  const receipt = flag("receipt");
  if (!receipt) throw new Error('Pass --receipt="<manual receipt number>"');

  const prisma = new PrismaClient();
  try {
    console.log(`Target: ${target.host}/${target.database}\n`);
    const result = await deleteVoidedSale(prisma, receipt, { apply: process.argv.includes("--apply") });
    console.log(JSON.stringify(result, null, 2));
    if (result.refused) process.exitCode = 1;
    else if (!result.applied && result.found) console.log("\nNothing was deleted. Re-run with --apply.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nFailed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
