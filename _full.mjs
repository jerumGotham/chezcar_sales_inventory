import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("/tmp/seed5.json", "utf8"));
const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
const api = (path, method = "GET", body) => page.evaluate(async ([p, m, b]) => {
  const r = await fetch(p, { method: m, credentials: "same-origin", headers: b ? { "Content-Type": "application/json" } : undefined, body: b ? JSON.stringify(b) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, data: j?.data, error: j?.error?.message };
}, [path, method, body]);

await page.goto("http://localhost:3000/sign-in");
await page.fill('input[type="email"]', "admin@chezcar.local");
await page.fill('input[type="password"]', process.env.SEED_ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);

// customer + order + payment
const cust = await api("/api/customers", "POST", { name: "Pedro Santos", mobile: "09180001111" });
const order = await api("/api/customer-orders", "POST", { customer: { id: cust.data.id, name: "Pedro Santos", mobile: "09180001111" }, type: "RESERVATION_WITH_DP", locationId: s.qc, salespersonId: s.salespersonId, downpaymentAmount: 4000, downpaymentReceiptNumber: "OR-3001", lines: [{ productId: s.productId, quantity: 3 }] });
console.log("order:", order.status, order.error ?? "");
const pay = await api(`/api/customer-orders/${order.data?.id}/payment`, "POST", { amount: 6000, reference: "OR-3002" });
console.log("payment:", pay.status, pay.error ?? "");

// direct sale
const sale = await api("/api/sales", "POST", { locationId: s.qc, salespersonId: s.salespersonId, manualReceiptNumber: "SI-5001", paymentMethod: "CASH", amountPaid: 30000, lines: [{ productId: s.productId, quantity: 2 }] });
console.log("direct sale:", sale.status, sale.error ?? "");

// product price change + throwaway product create/delete
const prodList = await api("/api/products?pageSize=100");
const row = (prodList.data?.data ?? prodList.data ?? []).find((p) => p.id === s.productId);
if (row) {
  const upd = await api(`/api/products/${row.id}`, "PATCH", { itemCode: row.itemCode, name: row.name, category: row.category ?? undefined, brand: row.brand ?? undefined, price: 16500, reorderLevel: row.reorderLevel ?? 0, status: "ACTIVE", vehicleCompatibilities: [] });
  console.log("price change:", upd.status, upd.error ?? "");
}
const temp = await api("/api/products", "POST", { itemCode: "ZZ-TEMP-1", name: "Temporary Demo Product", price: 500, reorderLevel: 0, status: "ACTIVE", vehicleCompatibilities: [] });
console.log("temp product:", temp.status, temp.error ?? "");
if (temp.data?.id) console.log("temp delete:", (await api(`/api/products/${temp.data.id}`, "DELETE")).status);

// stock transfer: draft, finalize, dispatch, then a discrepancy
const transfer = await api("/api/stock-transfers", "POST", { destinationId: s.qc, lines: [{ productId: s.productId, quantity: 5 }] });
console.log("transfer:", transfer.status, transfer.error ?? "");
let version = transfer.data?.version;
const tid = transfer.data?.id;
if (tid) {
  const fin = await api(`/api/stock-transfers/${tid}/finalize`, "POST", { version });
  version = fin.data?.version ?? version;
  const disp = await api(`/api/stock-transfers/${tid}/dispatch`, "POST", { version });
  version = disp.data?.version ?? version;
  console.log("finalize/dispatch:", fin.status, disp.status, disp.error ?? "");
  const lineId = disp.data?.lines?.[0]?.id ?? fin.data?.lines?.[0]?.id;
  if (lineId) {
    const disc = await api(`/api/stock-transfers/${tid}/report-discrepancy`, "POST", { version, notes: "Short by one piece on arrival", lines: [{ lineId, actualQuantity: 4, reason: "Missing on delivery" }] });
    console.log("discrepancy:", disc.status, disc.error ?? "");
  }
}

await page.goto("http://localhost:3000/audit", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
console.log("--- audit rows ---");
console.log((await page.locator("table").innerText()).slice(0, 2000));
await page.waitForTimeout(1200000);
await browser.close();
