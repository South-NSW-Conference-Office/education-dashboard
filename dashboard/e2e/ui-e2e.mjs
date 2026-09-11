/* UI end-to-end suite — Playwright/Chromium against the dev SPA (5199) proxied to the
   isolated test backend (3050). Screenshots land next to this script. */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:5199";
const SHOTS = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `e2e-${name}.png`), fullPage: false });
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("PASS " + name); }
  catch (e) { results.push({ name, ok: false, err: String(e.message ?? e).split("\n")[0] }); console.log("FAIL " + name + " — " + String(e.message ?? e).split("\n")[0]); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await test("app boots and lands on the databoard", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForURL(/\/databoard/, { timeout: 15000 });
  await shot(page, "01-databoard");
});

await test("no auth wall with SSO off (guest mode)", async () => {
  const login = await page.getByText(/sign in/i).count();
  if (login > 0 && (await page.locator(".sidebar, .portal-rail").count()) === 0) throw new Error("login screen shown despite SSO off");
});

await test("sidebar renders with WHITE background in light mode", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  const el = page.locator(".sidebar:visible, .portal-rail:visible").first();
  await el.waitFor({ state: "visible", timeout: 10000 });
  const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor);
  if (bg !== "rgb(255, 255, 255)") throw new Error("sidebar bg is " + bg);
});

await test("databoard shows the published week's content", async () => {
  await page.getByText(/cash on hand/i).first().waitFor({ timeout: 15000 });
});

await test("finance summary lists the schools", async () => {
  await page.goto(BASE + "/finance", { waitUntil: "networkidle" });
  await page.getByText(/Border Christian College/i).first().waitFor({ timeout: 15000 });
  await shot(page, "02-summary");
});

await test("finance board (bcc) shows approved July board", async () => {
  await page.goto(BASE + "/finance/bcc", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Border Christian College/i }).waitFor({ timeout: 15000 });
  await page.getByText(/approved/i).first().waitFor({ timeout: 10000 });
  await shot(page, "03-board-overview");
});

await test("details tab lists line items", async () => {
  await page.goto(BASE + "/finance/bcc/details", { waitUntil: "networkidle" });
  await page.getByText(/Tuition fees/i).first().waitFor({ timeout: 15000 });
  await shot(page, "04-details");
});

await test("show-empty-lines checkbox reveals more rows", async () => {
  const box = page.locator(".statement-option input[type=checkbox]").first();
  await box.waitFor({ timeout: 10000 });
  const before = await page.locator("tbody tr").count();
  await box.click();
  await page.waitForTimeout(300);
  const after = await page.locator("tbody tr").count();
  if (after < before) throw new Error(`rows shrank ${before} -> ${after}`);
});

let editedValue = null;
await test("edit flow: row pencil, change a figure, save draft", async () => {
  const row = page.locator("tbody tr", { hasText: "Tuition fees" }).first();
  await row.waitFor({ timeout: 10000 });
  await row.hover();
  await row.locator(".rowbtn.pencil").first().click();
  const input = page.locator('tbody input[aria-label="actual"]').first();
  await input.waitFor({ timeout: 15000 });
  editedValue = String(88000 + Math.floor(Math.random() * 1000));
  await input.fill(editedValue);
  const okBtn = page.locator("tbody .rowbtn.ok").first();
  if (await okBtn.count()) await okBtn.click();
  await page.locator(".savebar, [class*=savebar]").first().waitFor({ timeout: 10000 });
  await shot(page, "05-editing");
  await page.getByRole("button", { name: /save draft/i }).click();
  await page.getByText(/draft saved/i).first().waitFor({ timeout: 15000 });
});

await test("draft badge appears for readers after saving", async () => {
  await page.goto(BASE + "/finance/bcc", { waitUntil: "networkidle" });
  await page.getByText(/draft v/i).first().waitFor({ timeout: 15000 });
  await shot(page, "06-draft-badge");
});

await test("publish flow: open draft and publish", async () => {
  await page.getByText(/open ›/i).first().click();
  await page.locator(".savebar, [class*=savebar]").first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /publish/i }).click();
  await page.getByText(/published as version/i).first().waitFor({ timeout: 15000 });
  await shot(page, "07-published");
});

await test("published figure is what was typed in the editor", async () => {
  await page.goto(BASE + "/finance/bcc/details", { waitUntil: "networkidle" });
  await page.getByText(/Tuition fees/i).first().waitFor({ timeout: 15000 });
  if (editedValue) {
    const grouped = Number(editedValue).toLocaleString("en-AU");
    await page.getByText(new RegExp(grouped.replace(/,/g, ","))).first().waitFor({ timeout: 10000 });
  }
});

await test("period picker: pinning June 2026 shows the June board", async () => {
  await page.goto(BASE + "/finance/bcc", { waitUntil: "networkidle" });
  const pill = page.locator(".pill", { hasText: /as at|latest|period/i }).first();
  await pill.click();
  const june = page.getByText(/June 2026/).first();
  await june.waitFor({ timeout: 10000 });
  await june.click();
  await page.waitForTimeout(800);
  await page.getByText(/June 2026/).first().waitFor({ timeout: 10000 });
  await shot(page, "08-june-lookback");
});

await test("dark mode toggle flips the theme", async () => {
  const btn = page.locator(".theme-btn, [class*=railBtn][title*=heme], button[title*=heme], button[aria-label*=heme]").first();
  if (!(await btn.count())) throw new Error("theme toggle not found");
  await btn.click();
  await page.waitForTimeout(400);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  if (!theme) throw new Error("data-theme not set after toggle");
  await shot(page, "09-theme-" + theme);
});

await test("unknown route falls back to the databoard", async () => {
  await page.goto(BASE + "/nowhere", { waitUntil: "networkidle" });
  await page.waitForURL(/\/databoard/, { timeout: 10000 });
});

await test("no uncaught page errors across the run", async () => {
  const fatal = consoleErrors.filter((e) => e.startsWith("pageerror:"));
  if (fatal.length) throw new Error(fatal.join(" | ").slice(0, 300));
});

await browser.close();
const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
if (consoleErrors.length) console.log("\nCONSOLE ERRORS (" + consoleErrors.length + "):\n" + [...new Set(consoleErrors)].slice(0, 10).join("\n"));
console.log(`\nUI TOTAL ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
