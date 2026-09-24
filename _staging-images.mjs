/**
 * Uploads the workbook's product photos to a running instance through the
 * application's own image API.
 *
 * The photos cannot ride along with the catalogue import: that writes rows to a
 * database, while the files have to land in the server's storage volume. Going
 * through POST /api/products/:id/image is the same path the Products screen
 * uses, so the app writes each file where it expects to find it again, with the
 * naming and the checks it applies to any other upload.
 *
 * Chrome opens on the sign-in page and waits for you to sign in yourself; the
 * script never sees the password and simply borrows the session afterwards.
 *
 *   node _staging-images.mjs --base=https://predatoroffroad.ph
 *
 * Options:
 *   --base=<url>   the site to upload to (default: the staging site)
 *   --file=<path>  a different workbook
 *   --limit=<n>    stop after n uploads, to try it on a few first
 *   --dry-run      match photos to products and report, uploading nothing
 */

import { readFileSync } from "node:fs";

import { chromium } from "playwright-core";
import * as XLSX from "xlsx";

const DEFAULT_BASE = "https://predatoroffroad.ph";
const DEFAULT_WORKBOOK = "C:/Users/Jerum/Downloads/REALTIME INVENTORY- NEW 3 (3).xlsx";
const SHEET = "REALTIME INVENTORY SEPTEMBER 20";
const HEADER_MARKER = "ITEM CODE";

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, file: DEFAULT_WORKBOOK, limit: 0, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--base=")) options.base = arg.slice("--base=".length).replace(/\/$/, "");
    else if (arg.startsWith("--file=")) options.file = arg.slice("--file=".length);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length)) || 0;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function xmlOf(files, entry) {
  const file = files[entry];
  if (!file) return null;
  const bytes = file.content ?? file._data;
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

function sniffImage(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((v, i) => bytes[i] === v)) return { type: "image/png", ext: "png" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

/** Reads the sheet's pictures and the item code of the row each one sits on. */
function readPhotos(file) {
  const workbook = XLSX.read(readFileSync(file), { type: "buffer", raw: true, bookFiles: true, sheets: [SHEET] });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`Sheet "${SHEET}" not found in ${file}`);

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: true, defval: "" });
  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => String(cell ?? "").trim().toUpperCase() === HEADER_MARKER),
  );
  if (headerIndex === -1) throw new Error("No ITEM CODE header on that sheet");

  const files = workbook.files ?? {};
  const workbookXml = xmlOf(files, "xl/workbook.xml");
  const workbookRels = xmlOf(files, "xl/_rels/workbook.xml.rels");
  const entry = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"/g)]
    .find((m) => m[1] === SHEET);
  const targets = new Map([...workbookRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const sheetFile = targets.get(entry[2]).replace(/^\/?(xl\/)?/, "").split("/").pop();
  const sheetRels = xmlOf(files, `xl/worksheets/_rels/${sheetFile}.rels`);
  const drawingPath = [...sheetRels.matchAll(/Target="([^"]*drawings\/[^"]+)"/g)][0][1].replace("../", "xl/");
  const drawingXml = xmlOf(files, drawingPath);
  const drawingRels = xmlOf(files, drawingPath.replace(/\/([^/]+)$/, "/_rels/$1") + ".rels");
  const media = new Map([...drawingRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map((m) => [m[1], m[2].replace("../", "xl/")]));

  const photos = new Map();
  for (const block of drawingXml.split(/<xdr:(?:one|two)CellAnchor/).slice(1)) {
    const row = block.match(/<xdr:row>(\d+)<\/xdr:row>/);
    const embed = block.match(/r:embed="([^"]+)"/);
    if (!row || !embed) continue;
    const mediaEntry = media.get(embed[1]);
    const mediaFile = mediaEntry && files[mediaEntry];
    if (!mediaFile) continue;

    // The sheet_to_json index and the anchor row are both 0-based.
    const itemCode = String(rows[Number(row[1])]?.[0] ?? "").replace(/\s+/g, " ").trim();
    if (!itemCode || photos.has(itemCode)) continue;

    const bytes = Buffer.from(mediaFile.content ?? mediaFile._data);
    const kind = sniffImage(bytes);
    if (!kind) continue;
    photos.set(itemCode, { bytes, ...kind, entry: mediaEntry });
  }
  return photos;
}

/** Walks the paged products endpoint and maps every item code to its id. */
async function fetchProductIds(request, base) {
  const byItemCode = new Map();
  for (let page = 1; ; page += 1) {
    const response = await request.get(`${base}/api/products?page=${page}&pageSize=100`);
    if (!response.ok()) {
      // The status alone says nothing about which query failed; the body
      // carries the server's own message.
      const body = await response.text().catch(() => "");
      throw new Error(
        `GET /api/products page ${page} -> ${response.status()}\n  body: ${body.slice(0, 600)}`,
      );
    }
    const body = await response.json();
    for (const row of body.data ?? []) byItemCode.set(String(row.itemCode), row.id);
    const meta = body.meta ?? {};
    if (!meta.totalPages || page >= meta.totalPages) break;
  }
  return byItemCode;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Reading photos from ${options.file}`);
  const photos = readPhotos(options.file);
  console.log(`photos found: ${photos.size}\n`);

  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${options.base}/sign-in`, { waitUntil: "domcontentloaded" });
    console.log("Chrome is open. Sign in there; this waits for the dashboard.");
    await page.waitForURL(/\/dashboard/, { timeout: 10 * 60 * 1000 });
    console.log("Signed in.\n");

    // The request context inherits the browser's cookies, so every call below
    // is made as the person who just signed in.
    const request = context.request;
    const ids = await fetchProductIds(request, options.base);
    console.log(`products on ${options.base}: ${ids.size}`);

    const work = [];
    const missing = [];
    for (const [itemCode, photo] of photos) {
      const id = ids.get(itemCode);
      if (id) work.push({ itemCode, id, photo });
      else missing.push(itemCode);
    }
    console.log(`photos matched to a product: ${work.length}`);
    if (missing.length) console.log(`no product for item code: ${missing.join(", ")}`);

    if (options.dryRun) {
      console.log("\nDry run. Nothing uploaded.");
      return;
    }

    const todo = options.limit ? work.slice(0, options.limit) : work;
    console.log(`\nUploading ${todo.length}...`);
    let done = 0;
    const failed = [];

    for (const item of todo) {
      const response = await request.post(`${options.base}/api/products/${item.id}/image`, {
        multipart: {
          image: {
            name: `${item.itemCode}.${item.photo.ext}`,
            mimeType: item.photo.type,
            buffer: item.photo.bytes,
          },
        },
      });
      if (response.ok()) {
        done += 1;
        if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
      } else {
        failed.push(`${item.itemCode}: HTTP ${response.status()} ${(await response.text()).slice(0, 80)}`);
      }
    }

    console.log(`\nuploaded : ${done}`);
    console.log(`failed   : ${failed.length}`);
    for (const line of failed.slice(0, 15)) console.log(`  ${line}`);
    if (failed.length > 15) console.log(`  ... and ${failed.length - 15} more`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`\nFailed: ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
});
