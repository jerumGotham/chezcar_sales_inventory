import "server-only";

import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { ReportResult } from "@/lib/contracts/reports";

type PdfColumn = { header: string; width: number; value: (row: Record<string, unknown>) => string };

const PAGE_WIDTH = PageSizes.A4[1];
const PAGE_HEIGHT = PageSizes.A4[0];
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 7;
const ROW_HEIGHT = 15;

function safe(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}

function fit(value: string, font: PDFFont, width: number) {
  const text = safe(value);
  if (font.widthOfTextAtSize(text, BODY_SIZE) <= width) return text;
  let shortened = text;
  while (shortened && font.widthOfTextAtSize(`${shortened}...`, BODY_SIZE) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function money(value: unknown) {
  return `PHP ${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: unknown) {
  return new Date(String(value)).toLocaleString("en-PH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Manila" });
}

function reportDefinition(report: ReportResult): { title: string; columns: PdfColumn[]; rows: Record<string, unknown>[]; summary: string[] } {
  if (report.type === "sales") return {
    title: "Sales Report",
    columns: [
      { header: "Verified", width: 76, value: (r) => dateTime(r.verifiedAt) }, { header: "Receipt", width: 70, value: (r) => String(r.receipt) },
      { header: "Branch", width: 90, value: (r) => String(r.branch) }, { header: "Salesperson", width: 90, value: (r) => String(r.salesperson) },
      { header: "Source", width: 78, value: (r) => String(r.source) }, { header: "Payment", width: 68, value: (r) => String(r.paymentMethod) },
      { header: "Total", width: 85, value: (r) => money(r.totalAmount) },
    ],
    rows: report.rows as unknown as Record<string, unknown>[],
    summary: [`Transactions: ${report.grandTotal.transactionCount}`, `Grand total: ${money(report.grandTotal.totalAmount)}`, ...report.branchTotals.map((row) => `${row.branch}: ${row.transactionCount} / ${money(row.totalAmount)}`)],
  };
  if (report.type === "inventory-summary" || report.type === "low-stock") return {
    title: report.type === "low-stock" ? "Low Stock Report" : "Inventory Summary",
    columns: [
      { header: "Code", width: 75, value: (r) => String(r.itemCode) }, { header: "Product", width: 145, value: (r) => String(r.product) },
      { header: "Branch", width: 105, value: (r) => String(r.branch) }, { header: "On hand", width: 55, value: (r) => String(r.onHand) },
      { header: "Reserved", width: 55, value: (r) => String(r.reserved) }, { header: "Quarantine", width: 60, value: (r) => String(r.quarantined) },
      { header: "Available", width: 55, value: (r) => String(r.available) }, { header: "Reorder", width: 52, value: (r) => String(r.reorderLevel) },
    ],
    rows: report.rows as unknown as Record<string, unknown>[],
    summary: report.type === "inventory-summary" ? [`Rows: ${report.rows.length}`, `On hand: ${report.totals.onHand}; Reserved: ${report.totals.reserved}; Quarantined: ${report.totals.quarantined}; Available: ${report.totals.available}`] : [`Low-stock rows: ${report.rows.length}`],
  };
  if (report.type === "inventory-movements") return {
    title: "Inventory Movements",
    columns: [
      { header: "Occurred", width: 76, value: (r) => dateTime(r.occurredAt) }, { header: "Branch", width: 88, value: (r) => String(r.branch) },
      { header: "Code", width: 70, value: (r) => String(r.itemCode) }, { header: "Product", width: 125, value: (r) => String(r.product) },
      { header: "Movement", width: 105, value: (r) => String(r.type) }, { header: "Qty", width: 35, value: (r) => String(r.quantity) },
      { header: "Actor", width: 80, value: (r) => String(r.actor) }, { header: "Reference", width: 78, value: (r) => String(r.reference) },
    ], rows: report.rows as unknown as Record<string, unknown>[], summary: [`Movements: ${report.rows.length}`],
  };
  return {
    title: "Returns & Warranty",
    columns: [
      { header: "Created", width: 76, value: (r) => dateTime(r.createdAt) }, { header: "Type", width: 92, value: (r) => String(r.recordType) },
      { header: "Reference", width: 78, value: (r) => String(r.reference) }, { header: "Branch", width: 90, value: (r) => String(r.branch) },
      { header: "Party", width: 105, value: (r) => String(r.party) }, { header: "Item", width: 130, value: (r) => String(r.item) },
      { header: "Qty", width: 35, value: (r) => String(r.quantity) }, { header: "Status", width: 70, value: (r) => String(r.status) },
    ], rows: report.rows as unknown as Record<string, unknown>[], summary: [`Records: ${report.rows.length}`],
  };
}

export async function createReportPdf(report: ReportResult, metadata: { generatedBy: string }): Promise<ArrayBuffer> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const definition = reportDefinition(report);
  let page: PDFPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const addPage = () => { page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]); y = PAGE_HEIGHT - MARGIN; };
  const ensure = (height: number) => { if (y - height < MARGIN) { addPage(); return true; } return false; };
  const text = (value: string, size = BODY_SIZE, font = regular) => { page.drawText(safe(value), { x: MARGIN, y, size, font, color: rgb(0.13, 0.16, 0.2) }); y -= size + 5; };
  const header = () => {
    page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_WIDTH, height: ROW_HEIGHT, color: rgb(0.92, 0.95, 0.94) });
    let x = MARGIN + 3;
    for (const column of definition.columns) { page.drawText(fit(column.header, bold, column.width - 6), { x, y, size: BODY_SIZE, font: bold }); x += column.width; }
    y -= ROW_HEIGHT;
  };
  document.setTitle(`Chezcar ${definition.title}`);
  text("CHEZCAR AUTO CARE", 9, bold);
  text(definition.title, 18, bold);
  text(`Generated: ${dateTime(report.generatedAt)} | User: ${metadata.generatedBy}`);
  text(`Authorized location scope${report.dateFrom || report.dateTo ? ` | Dates: ${report.dateFrom ?? "start"} to ${report.dateTo ?? "today"}` : " | Current snapshot"}`);
  y -= 3;
  for (const line of definition.summary) text(line, 8);
  y -= 5;
  ensure(ROW_HEIGHT * 2); header();
  if (!definition.rows.length) text("No rows in the authorized report scope.");
  for (const row of definition.rows) {
    if (ensure(ROW_HEIGHT + 3)) header();
    let x = MARGIN + 3;
    for (const column of definition.columns) { page.drawText(fit(column.value(row), regular, column.width - 6), { x, y, size: BODY_SIZE, font: regular }); x += column.width; }
    page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 4 }, thickness: 0.35, color: rgb(0.82, 0.84, 0.83) });
    y -= ROW_HEIGHT;
  }
  const pages = document.getPages();
  pages.forEach((current, index) => current.drawText(`Page ${index + 1} of ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 62, y: 18, size: 7, font: regular }));
  return Uint8Array.from(await document.save()).buffer;
}
