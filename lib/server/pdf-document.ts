import "server-only";

import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfColumn = { header: string; width: number; numeric?: boolean };

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

export function safe(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E\n]/g, "?");
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

export function money(value: number) {
  return `PHP ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dateTime(value: string | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
}

export function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export type PdfBuilder = {
  /** One wrapped paragraph at the current cursor; `bold` selects the bold face. */
  text: (value: string, size?: number, bold?: boolean) => void;
  /** Heading plus a bordered table; repeats column labels on every continuation page. */
  table: (heading: string, columns: PdfColumn[], rows: string[][], emphasizeLast?: boolean) => void;
  /** Extra vertical gap at the current cursor. */
  space: (amount: number) => void;
  /** Stamps the footer on every page and returns the serialized document. */
  finish: () => Promise<ArrayBuffer>;
};

/**
 * Shared landscape-A4 document used by the Reports PDF and the list exports.
 * Page furniture, pagination and table continuation stay identical across them.
 */
export async function createPdfBuilder(options: {
  title: string;
  documentTitle: string;
  generatedBy: string;
  footer: string;
}): Promise<PdfBuilder> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  document.setTitle(options.documentTitle);
  document.setAuthor(safe(options.generatedBy));
  let page: PDFPage;
  let y = 0;

  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("CHEZCAR AUTO CARE", { x: MARGIN, y: PAGE_HEIGHT - MARGIN, size: 10, font: bold, color: INK });
    page.drawText(options.title, { x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(options.title, 10), y: PAGE_HEIGHT - MARGIN, size: 10, font: bold, color: MUTED });
    page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - MARGIN - 10 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - MARGIN - 10 }, color: RULE, thickness: 0.7 });
    y = PAGE_HEIGHT - MARGIN - 32;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) addPage(); };
  const text = (value: string, size = BODY_SIZE, emphasized = false) => {
    const font = emphasized ? bold : regular;
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
      text(`${heading}${continued ? " (continued)" : ""}`, 12, true);
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
        if (offset > 0) text(`Row ${rowIndex + 1} (continued)`, 8, true);
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

  const finish = async () => {
    const pages = document.getPages();
    pages.forEach((current, index) => {
      current.drawText(options.footer, { x: MARGIN, y: 22, size: 8, font: regular, color: MUTED });
      const pageNumber = `Page ${index + 1} of ${pages.length}`;
      current.drawText(pageNumber, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageNumber, 8), y: 22, size: 8, font: regular, color: MUTED });
    });
    return Uint8Array.from(await document.save()).buffer;
  };

  addPage();
  return { text, table, space: (amount: number) => { y -= amount; }, finish };
}
