import "server-only";

import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ReportResult, SalesReport } from "@/lib/contracts/reports";

type PdfColumn = { header: string; width: number; numeric?: boolean };

const PAGE_WIDTH = PageSizes.A4[1];
const PAGE_HEIGHT = PageSizes.A4[0];
const MARGIN = 36;
const BOTTOM = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 9;
const LINE_HEIGHT = 12;
const PADDING = 7;
const INK = rgb(0.13, 0.16, 0.2);
const MUTED = rgb(0.36, 0.4, 0.44);
const RULE = rgb(0.82, 0.85, 0.86);
const TINT = rgb(0.93, 0.96, 0.95);

function safe(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\n]/g, "?");
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of safe(value).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        if (line && font.widthOfTextAtSize(`${line}${character}`, size) > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

function money(value: number) {
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function createReportPdf(report: ReportResult, metadata: { generatedBy: string }): Promise<ArrayBuffer> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const title = report.type === "sales" ? "Sales Report" : report.type === "salesperson-sales" ? "Sales by Salesperson" : report.type === "inventory-summary" ? "Inventory Summary" : "Returns & Warranty";
  document.setTitle(`Chezcar ${title}`);
  document.setAuthor(safe(metadata.generatedBy));
  let page: PDFPage;
  let y = 0;

  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("CHEZCAR AUTO CARE", { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 10, font: bold, color: INK });
    page.drawText(title, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(title, 10), y: PAGE_HEIGHT - MARGIN, size: 10, font: bold, color: MUTED });
    page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 10 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 10 }, color: RULE, thickness: 0.7 });
    y = PAGE_HEIGHT - MARGIN - 32;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) addPage(); };
  const text = (value: string, size = BODY_SIZE, font = regular) => {
    for (const line of wrap(value, font, size, CONTENT_WIDTH)) {
      ensure(size + 6);
      page.drawText(line, { x: MARGIN, y: y - size, size, font, color: INK });
      y -= size + 6;
    }
  };

  const table = (heading: string, columns: PdfColumn[], rows: string[][], emphasizeLast = false) => {
    const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => CONTENT_WIDTH * column.width / totalWidth);
    const headerLines = columns.map((column, index) => wrap(column.header, bold, BODY_SIZE, widths[index] - PADDING * 2));
    const headerHeight = Math.max(...headerLines.map((cell) => cell.length)) * LINE_HEIGHT + PADDING * 2;
    const headingHeight = wrap(`${heading} (continued)`, bold, 12, CONTENT_WIDTH).length * 18 + 5;
    const drawCells = (cells: string[][], font: PDFFont, background?: ReturnType<typeof rgb>, header = false) => {
      const height = Math.max(...cells.map((cell) => cell.length), 1) * LINE_HEIGHT + PADDING * 2;
      if (background) page.drawRectangle({ x: MARGIN, y: y - height, width: CONTENT_WIDTH, height, color: background });
      let x = MARGIN;
      cells.forEach((cell, index) => {
        cell.forEach((line, lineIndex) => page.drawText(line, {
          x: columns[index].numeric && !header ? x + widths[index] - PADDING - font.widthOfTextAtSize(line, BODY_SIZE) : x + PADDING,
          y: y - PADDING - BODY_SIZE - lineIndex * LINE_HEIGHT,
          size: BODY_SIZE, font, color: INK,
        }));
        x += widths[index];
      });
      y -= height;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.4, color: RULE });
    };
    const header = (continued = false) => {
      text(`${heading}${continued ? " (continued)" : ""}`, 12, bold);
      y -= 5;
      drawCells(headerLines, bold, TINT, true);
    };
    // Leave room for a heading, column labels and at least one data line.
    ensure(headingHeight + headerHeight + LINE_HEIGHT + PADDING * 2);
    header();
    if (!rows.length) {
      text("No rows in the applied authorized scope.");
      y -= 12;
      return;
    }
    rows.forEach((row, rowIndex) => {
      const font = emphasizeLast && rowIndex === rows.length - 1 ? bold : regular;
      const wrapped = row.map((cell, index) => wrap(cell, font, BODY_SIZE, widths[index] - PADDING * 2));
      const totalLines = Math.max(...wrapped.map((cell) => cell.length), 1);
      const height = totalLines * LINE_HEIGHT + PADDING * 2;
      const freshPageRoom = PAGE_HEIGHT - MARGIN - 32 - BOTTOM - headerHeight - headingHeight;
      // Ordinary rows stay together; exceptionally long rows continue without truncation.
      if (height > y - BOTTOM && height <= freshPageRoom) { addPage(); header(true); }
      let offset = 0;
      while (offset < totalLines) {
        if (y - BOTTOM < LINE_HEIGHT + PADDING * 2) { addPage(); header(true); }
        if (offset > 0) text(`Row ${rowIndex + 1} (continued)`, 8, bold);
        const availableLines = Math.max(1, Math.floor((y - BOTTOM - PADDING * 2) / LINE_HEIGHT));
        const count = Math.min(totalLines - offset, availableLines);
        const background = emphasizeLast && rowIndex === rows.length - 1 ? TINT : rowIndex % 2 ? rgb(0.97, 0.98, 0.98) : undefined;
        drawCells(wrapped.map((cell) => cell.slice(offset, offset + count)), font, background);
        offset += count;
        if (offset < totalLines) { addPage(); header(true); }
      }
    });
    y -= 20;
  };

  addPage();
  text(title, 22, bold);
  y -= 4;
  text(`Generated: ${dateTime(report.generatedAt)} (Asia/Manila)`);
  text(`Generated by: ${metadata.generatedBy}`);
  text(`Authorized scope: ${report.effectiveScope.map((row) => row.label).join(", ") || "No authorized locations"}`);
  text(report.type === "inventory-summary"
    ? "Current branch snapshot. Available = on hand - reserved - quarantined. Positive available stock only; Stock Room and in-transit stock excluded. Comparison cells with no positive stock show 0."
    : `From ${report.dateFrom} to ${report.dateTo}, inclusive. Based on ${report.type === "sales" || report.type === "salesperson-sales" ? "verification" : "case creation"} date in Asia/Manila.`);
  text(`Applied filters: ${report.appliedFilters.map((filter) => `${filter.label}: ${filter.value}`).join("; ") || "None"}`);
  y -= 16;

  if (report.type === "sales" || report.type === "salesperson-sales") {
    const total = report.grandTotal;
    table("Sales overview", [{ header: "Measure", width: 3 }, { header: "Total", width: 2, numeric: true }], [
      ["Verified transactions", String(total.transactionCount)], ["Units sold", String(total.units)],
      ["Discounts", money(total.totalDiscount)], ["Average sale", money(total.averageSale)],
      ["Overall verified sales", money(total.totalAmount)],
    ], true);
    if (report.type === "salesperson-sales") {
      text("Verified sales attributed to each salesperson, not commissions or collected payments. Older unattributed sales remain under Not recorded (legacy).");
      table("Salesperson subtotals", [
        { header: "Salesperson", width: 3 }, { header: "Transactions", width: 1.1, numeric: true },
        { header: "Units", width: 0.8, numeric: true }, { header: "Discounts", width: 1.5, numeric: true },
        { header: "Average sale", width: 1.5, numeric: true }, { header: "Verified sales", width: 1.6, numeric: true },
        { header: "Share", width: 0.8, numeric: true },
      ], [
        ...report.salespersonTotals.map((row) => [row.salesperson, String(row.transactionCount), String(row.units), money(row.totalDiscount), money(row.averageSale), money(row.totalAmount), `${row.percentage.toFixed(1)}%`]),
        ["OVERALL TOTAL", String(total.transactionCount), String(total.units), money(total.totalDiscount), money(total.averageSale), money(total.totalAmount), total.totalAmount ? "100.0%" : "0.0%"],
      ], true);
    }
    table("Branch subtotals", [
      { header: "Branch", width: 4 }, { header: "Transactions", width: 1.3, numeric: true },
      { header: "Units", width: 1, numeric: true }, { header: "Verified sales", width: 2, numeric: true },
      { header: "Share", width: 1, numeric: true },
    ], [
      ...report.branchTotals.map((row) => [row.branch, String(row.transactionCount), String(row.units), money(row.totalAmount), `${row.percentage.toFixed(1)}%`]),
      ["OVERALL TOTAL", String(total.transactionCount), String(total.units), money(total.totalAmount), total.totalAmount ? "100.0%" : "0.0%"],
    ], true);
    const salesByPerson = new Map<string | null, SalesReport["rows"]>();
    if (report.type === "salesperson-sales") for (const row of report.rows) {
      const group = salesByPerson.get(row.salespersonId) ?? [];
      group.push(row);
      salesByPerson.set(row.salespersonId, group);
    }
    const detailGroups = report.type === "salesperson-sales"
      ? report.salespersonTotals.map((group) => ({ heading: `Salesperson: ${group.salesperson} - ${group.transactionCount} receipt(s)`, rows: salesByPerson.get(group.salespersonId) ?? [], subtotal: group }))
      : [{ heading: "Verified sales detail", rows: report.rows, subtotal: null }];
    for (const group of detailGroups) table(group.heading, [
      { header: "Receipt / verified", width: 1.6 }, { header: "Branch", width: 1.35 },
      { header: "Customer / personnel", width: 2.3 }, { header: "Source / payment / status", width: 1.5 },
      { header: "Units", width: 0.6, numeric: true }, { header: "Discount", width: 1.25, numeric: true },
      { header: "Final amount", width: 1.4, numeric: true },
    ], [...group.rows.map((row) => [
      `${row.manualReceiptNumber}\n${dateTime(row.verifiedAt)}`, row.branch,
      `Customer: ${row.customer}\nSalesperson: ${row.salesperson}\nEncoder: ${row.encoder}`,
      `${row.source}\n${humanize(row.paymentMethod)}\n${humanize(row.verificationStatus)}`,
      String(row.units), money(row.discountAmount), money(row.totalAmount),
    ]), ...(group.subtotal ? [["SALESPERSON TOTAL", "", "", "", String(group.subtotal.units), money(group.subtotal.totalDiscount), money(group.subtotal.totalAmount)]] : [])], group.subtotal !== null);
  } else if (report.type === "inventory-summary") {
    table("Inventory overview", [{ header: "Measure", width: 3 }, { header: "Total", width: 2, numeric: true }], [
      ["Products in filtered rows", String(report.totals.productCount)], ["Authorized branches in scope", String(report.totals.locationCount)],
      ["Available units", String(report.totals.available)],
    ], true);
    const inventoryColumns: PdfColumn[] = [
      { header: "Item code", width: 1.4 }, { header: "Product", width: 3.5 },
      { header: "Category", width: 1.5 }, { header: "Brand", width: 1.5 }, { header: "Available", width: 1.3, numeric: true },
    ];
    table(report.effectiveScope.length > 1 ? "Product totals across selected branches" : "Available products", inventoryColumns, [
      ...report.rows.map((row) => [row.itemCode, row.product, row.category, row.brand, String(row.available)]),
      ["FULL FILTERED TOTAL", "", "", "", String(report.totals.available)],
    ], true);
    if (report.effectiveScope.length > 1) {
      text("Branch comparison follows in separate sections. Every section includes the full filtered product set, including 0 cells, without narrowing columns for additional branches.");
      for (const location of report.effectiveScope) {
        table(`Branch: ${location.label}`, inventoryColumns, [
          ...report.rows.map((row) => [row.itemCode, row.product, row.category, row.brand, String(row.availableByLocation[location.id])]),
          ["BRANCH TOTAL", "", "", "", String(report.branchTotals.find((total) => total.locationId === location.id)?.available ?? 0)],
        ], true);
      }
    }
  } else {
    const total = report.totals;
    text("Backjob charges are recorded case amounts, not collected payments or additional Sales revenue. Supplier refunds/credits are separate claim tracking, not ledger totals. Amounts follow applied case filters, including status.");
    text("Backjobs list all original items in one case row. Their affected-unit quantity is not recorded; original item selections are not unit counts.");
    table("Case overview", [{ header: "Measure", width: 3 }, { header: "Total", width: 2, numeric: true }], [
      ["Total cases", String(total.total)], ["Open", String(total.open)], ["Completed", String(total.completed)],
      ["Overdue", String(total.overdue)], ["Unresolved quarantined quantity", String(total.unresolvedQuarantinedQuantity)],
      ["Backjob charges recorded (not Sales revenue)", money(total.backjobChargeAmount)],
      ["Supplier refunds (claim tracking, not ledger totals)", money(total.supplierRefundAmount)],
      ["Supplier credits (claim tracking, not ledger totals)", money(total.supplierCreditAmount)],
    ]);
    table("Case breakdowns", [{ header: "Group", width: 1 }, { header: "Value", width: 4 }, { header: "Cases", width: 1, numeric: true }], [
      ...total.byType.map((row) => ["Type", row.label, String(row.count)]),
      ...total.byStatus.map((row) => ["Status", humanize(row.label), String(row.count)]),
      ...total.byBranch.map((row) => ["Branch", row.label, String(row.count)]),
      ...total.byResolution.map((row) => ["Resolution", humanize(row.label), String(row.count)]),
    ]);
    table("Case detail", [
      { header: "Case / references", width: 1.7 }, { header: "Location / party", width: 1.7 },
      { header: "Product / quantity", width: 2.2 }, { header: "Personnel", width: 1.5 },
      { header: "Status / dates", width: 1.8 }, { header: "Case amounts / quarantine", width: 1.8 },
    ], report.rows.map((row) => [
      `${row.recordType}\n${row.reference}\nCase date: ${dateTime(row.caseDate)}\nOriginal: ${row.originalReference || "None"}\nLinked: ${row.linkedCase || "None"}`,
      `${row.branch}\nCustomer / supplier: ${row.party}`,
      `${row.product}\nCase quantity: ${row.quantity === null ? "Not recorded" : row.quantity}`,
      `Assigned: ${row.assignedPersonnel}\nSalesperson: ${row.salesperson}`,
      `${humanize(row.status)}\nResolution: ${humanize(row.resolution)}\nTarget: ${dateTime(row.targetDate)}\nOverdue: ${row.overdue ? "Yes" : "No"}`,
      `Backjob charge recorded: ${row.backjobChargeAmount === null ? "Not applicable" : money(row.backjobChargeAmount)}\nUnresolved quarantine: ${row.unresolvedQuarantinedQuantity}\nSupplier refund: ${money(row.supplierRefundAmount)}\nSupplier credit: ${money(row.supplierCreditAmount)}`,
    ]));
  }

  const pages = document.getPages();
  pages.forEach((current, index) => {
    current.drawText("Private | Authorized report scope | Times: Asia/Manila", { x: MARGIN, y: 22, size: 8, font: regular, color: MUTED });
    const pageNumber = `Page ${index + 1} of ${pages.length}`;
    current.drawText(pageNumber, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageNumber, 8), y: 22, size: 8, font: regular, color: MUTED });
  });
  return Uint8Array.from(await document.save()).buffer;
}
