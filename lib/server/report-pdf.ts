import "server-only";

import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

type ReportsPdfSummary = {
  sales: {
    totalSales: number;
    transactionCount: number;
    rows: Array<{
      manualReceiptNumber: string;
      branch: string;
      customer: string;
      totalAmount: number;
      reviewStatus: string;
    }>;
  };
  accounting: {
    unverified: number;
    verified: number;
    flagged: number;
    flaggedRows: Array<{
      manualReceiptNumber: string;
      branch: string;
      customer: string;
      totalAmount: number;
      mismatchCategory: string | null;
    }>;
  };
  orders: {
    open: number;
    rows: Array<{
      orderNo: string;
      customer: string;
      status: string;
      balance: number;
    }>;
  };
  inventory: Array<{
    itemCode: string;
    name: string;
    location: string;
    onHand: number;
    reserved: number;
    available: number;
  }>;
};

type PdfColumn<Row> = {
  header: string;
  width: number;
  value: (row: Row) => string;
};

const PAGE_WIDTH = PageSizes.A4[1];
const PAGE_HEIGHT = PageSizes.A4[0];
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 8;
const ROW_HEIGHT = 16;

function pdfSafeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function fitText(text: string, font: PDFFont, size: number, width: number) {
  const safe = pdfSafeText(text);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;

  let shortened = safe;
  while (
    shortened.length > 0 &&
    font.widthOfTextAtSize(`${shortened}...`, size) > width
  ) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}...`;
}

function formatMoney(value: number) {
  return `PHP ${new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

export async function createReportsPdf(
  summary: ReportsPdfSummary,
  metadata: { generatedAt: Date; generatedBy: string },
): Promise<ArrayBuffer> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y: number;

  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) {
      addPage();
      return true;
    }
    return false;
  };

  const drawText = (
    text: string,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const size = options.size ?? BODY_SIZE;
    page.drawText(pdfSafeText(text), {
      x: MARGIN,
      y,
      size,
      font: options.font ?? regular,
      color: options.color ?? rgb(0.15, 0.18, 0.22),
    });
    y -= size + 6;
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(34);
    y -= 6;
    drawText(title, { size: 12, font: bold, color: rgb(0.02, 0.45, 0.31) });
  };

  const drawTable = <Row,>(
    title: string,
    columns: Array<PdfColumn<Row>>,
    rows: Row[],
  ) => {
    drawSectionTitle(title);

    const drawHeader = () => {
      page.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        color: rgb(0.92, 0.95, 0.94),
      });
      let x = MARGIN + 4;
      for (const column of columns) {
        page.drawText(
          fitText(column.header, bold, BODY_SIZE, column.width - 8),
          { x, y, size: BODY_SIZE, font: bold, color: rgb(0.12, 0.18, 0.16) },
        );
        x += column.width;
      }
      y -= ROW_HEIGHT;
    };

    ensureSpace(ROW_HEIGHT * 2);
    drawHeader();

    if (rows.length === 0) {
      drawText("No rows in the authorized report scope.");
      return;
    }

    for (const row of rows) {
      if (ensureSpace(ROW_HEIGHT + 4)) drawHeader();
      let x = MARGIN + 4;
      for (const column of columns) {
        page.drawText(
          fitText(column.value(row), regular, BODY_SIZE, column.width - 8),
          { x, y, size: BODY_SIZE, font: regular, color: rgb(0.15, 0.18, 0.22) },
        );
        x += column.width;
      }
      page.drawLine({
        start: { x: MARGIN, y: y - 5 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 5 },
        thickness: 0.4,
        color: rgb(0.82, 0.84, 0.83),
      });
      y -= ROW_HEIGHT;
    }
  };

  addPage();
  document.setTitle("Chezcar Reports");
  document.setAuthor("Chezcar Sales & Inventory");
  document.setSubject("Authorized live reports export");
  document.setProducer("Chezcar Sales & Inventory");

  drawText("CHEZCAR AUTO CARE", {
    size: 10,
    font: bold,
    color: rgb(0.02, 0.45, 0.31),
  });
  drawText("Sales & Inventory Reports", { size: 20, font: bold });
  drawText(
    `Generated at: ${metadata.generatedAt.toLocaleString("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    })}`,
  );
  drawText(`Generated by user: ${metadata.generatedBy}`);
  drawText("Scope: Live data from the exporter's authorized locations");

  drawSectionTitle("Report Summary");
  drawText(`Sales total: ${formatMoney(summary.sales.totalSales)}`);
  drawText(`Posted transactions: ${summary.sales.transactionCount}`);
  drawText(
    `Accounting: ${summary.accounting.unverified} unverified, ${summary.accounting.verified} verified, ${summary.accounting.flagged} flagged`,
  );
  drawText(`Open orders: ${summary.orders.open}`);
  drawText(`Inventory rows: ${summary.inventory.length}`);

  drawTable(
    "Sales",
    [
      { header: "Receipt", width: 105, value: (row) => row.manualReceiptNumber },
      { header: "Branch", width: 120, value: (row) => row.branch },
      { header: "Customer", width: 205, value: (row) => row.customer },
      { header: "Total", width: 110, value: (row) => formatMoney(row.totalAmount) },
      { header: "Review", width: 130, value: (row) => row.reviewStatus },
    ],
    summary.sales.rows,
  );

  drawTable(
    "Accounting Mismatches",
    [
      { header: "Receipt", width: 105, value: (row) => row.manualReceiptNumber },
      { header: "Branch", width: 120, value: (row) => row.branch },
      { header: "Customer", width: 185, value: (row) => row.customer },
      { header: "Mismatch", width: 145, value: (row) => row.mismatchCategory ?? "Mismatch" },
      { header: "Total", width: 115, value: (row) => formatMoney(row.totalAmount) },
    ],
    summary.accounting.flaggedRows,
  );

  drawTable(
    "Customer Orders",
    [
      { header: "Order", width: 130, value: (row) => row.orderNo },
      { header: "Customer", width: 250, value: (row) => row.customer },
      { header: "Status", width: 145, value: (row) => row.status },
      { header: "Balance", width: 145, value: (row) => formatMoney(row.balance) },
    ],
    summary.orders.rows,
  );

  drawTable(
    "Inventory",
    [
      { header: "Item Code", width: 105, value: (row) => row.itemCode },
      { header: "Product", width: 210, value: (row) => row.name },
      { header: "Location", width: 160, value: (row) => row.location },
      { header: "On Hand", width: 65, value: (row) => String(row.onHand) },
      { header: "Reserved", width: 65, value: (row) => String(row.reserved) },
      { header: "Available", width: 65, value: (row) => String(row.available) },
    ],
    summary.inventory,
  );

  const pages = document.getPages();
  for (const [index, currentPage] of pages.entries()) {
    currentPage.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 20,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.43, 0.46),
    });
  }

  return Uint8Array.from(await document.save()).buffer;
}
