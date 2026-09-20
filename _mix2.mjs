import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const ids = JSON.parse(readFileSync("/tmp/ids.json", "utf8"));
const browser = await chromium.launch({ headless: false, channel: "chrome" });
async function session(email, password) {
  const page = await (await browser.newContext({ viewport: { width: 1350, height: 840 } })).newPage();
  await page.goto("http://localhost:3000/sign-in");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  return page;
}
const receiver = await session("multi.receiver@chezcar.local", "MultiReceiver!2026");
const posted = await receiver.evaluate(async (ids) => {
  const r = await fetch("/api/stock-receipts", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    reference: "DR-MIXED-002", supplierId: ids.supplier, locationId: ids.bl,
    lines: [
      { productId: "cmtwlfmqc0006sivnjyn0p2n9", expectedQuantity: 2, acceptedQuantity: 2, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 900 },
      { productId: "cmtwlfmqc0007sivnr758qibn", expectedQuantity: 4, acceptedQuantity: 4, quarantinedQuantity: 0, missingQuantity: 0, unitCost: 750 },
    ] }) });
  return r.status;
}, ids);
console.log("mixed receipt status:", posted);

const binan = await session("binan.viewer@chezcar.local", "BinanViewer!2026");
await binan.goto("http://localhost:3000/notifications", { waitUntil: "networkidle" });
await binan.waitForTimeout(3000);
const row = binan.locator("tr", { hasText: "DR-MIXED-002" }).first();
console.log("buttons:", JSON.stringify(await row.locator("button").allInnerTexts()));
await row.getByRole("button", { name: /Open/ }).click();
await binan.waitForTimeout(4000);
console.log("landed on:", binan.url());
const main = await binan.locator("main").innerText();
console.log(main.slice(main.indexOf("Showing totals"), main.indexOf("Showing totals") + 60));
console.log("table:\n" + (await binan.locator("table").first().innerText()).slice(0, 400));
console.log("done");
await binan.waitForTimeout(1200000);
await browser.close();
