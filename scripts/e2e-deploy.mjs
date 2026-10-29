// Read-only Playwright check against a deployed build (Vercel preview or production).
// Usage: node scripts/e2e-deploy.mjs https://<deployment>.vercel.app
// Loads the NYC map, switches to Chicago in Settings, searches, opens a preview,
// reloads, and verifies both tile sets and the city-scoped viewport RPC are used.
// Writes nothing to the database (no posts, votes, roles or reports).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2];
if (!BASE) {
  console.error("usage: node scripts/e2e-deploy.mjs <base-url>");
  process.exit(2);
}
const SHOTS = new URL("../.e2e-shots/deploy/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const tiles = { nyc: { ok: 0, bad: 0 }, chicago: { ok: 0, bad: 0 } };
const rpc = { nyc: 0, chicago: 0 };
const errors = [];
let chicagoTileUrl = "";
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 160));
});
page.on("pageerror", (e) => errors.push("pageerror " + String(e).slice(0, 160)));
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("/data/tiles-chicago/")) {
    tiles.chicago[res.ok() ? "ok" : "bad"]++;
    if (!chicagoTileUrl) chicagoTileUrl = u;
  } else if (u.includes("/data/tiles/")) tiles.nyc[res.ok() ? "ok" : "bad"]++;
  if (u.includes("/rpc/get_businesses_in_viewport_slim") && res.ok()) {
    try {
      const c = JSON.parse(res.request().postData() ?? "{}").city;
      rpc[c === "chicago" ? "chicago" : "nyc"]++;
    } catch {
      /* not json */
    }
  }
});

const search = page.locator('input[placeholder="Find that next gig!"]');
const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ ok: true, line: `PASS ${name}${detail ? " — " + detail : ""}` });
  } catch (e) {
    results.push({ ok: false, line: `FAIL ${name} — ${String(e.message).split("\n")[0]}` });
    await page.screenshot({ path: `${SHOTS}fail-${results.length}.png` }).catch(() => {});
  }
};
const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png` });

await step("deployment loads the NYC map", async () => {
  const res = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  if (!res.ok()) throw new Error(`status ${res.status()}`);
  await search.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2500);
  await shot("01-nyc");
  if (tiles.nyc.ok === 0 || tiles.nyc.bad > 0) throw new Error(`nyc tiles ok=${tiles.nyc.ok} bad=${tiles.nyc.bad}`);
  if (rpc.nyc === 0) throw new Error("no nyc viewport RPC");
  return `tiles ok=${tiles.nyc.ok}, nyc viewport calls=${rpc.nyc}`;
});

await step("switch to Chicago in Settings", async () => {
  await page.locator('button[aria-label="Settings"]').click();
  const radio = page.locator('[role="radiogroup"][aria-label="Map city"] button', { hasText: "Chicago" });
  await radio.waitFor({ state: "visible", timeout: 20_000 });
  await shot("02-settings");
  await radio.click();
  if ((await radio.getAttribute("aria-checked")) !== "true") throw new Error("Chicago not selected");
  await page.locator('button[aria-label="Map"]').click();
  await search.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3000);
  await shot("03-chicago");
  if (tiles.chicago.ok === 0 || tiles.chicago.bad > 0) throw new Error(`chicago tiles ok=${tiles.chicago.ok} bad=${tiles.chicago.bad}`);
  if (!/\?v=\d+$/.test(chicagoTileUrl)) throw new Error(`tile url is not versioned: ${chicagoTileUrl}`);
  if (rpc.chicago === 0) throw new Error("no chicago viewport RPC");
  return `tiles ok=${tiles.chicago.ok} (${chicagoTileUrl.split("/data/")[1]}), chicago viewport calls=${rpc.chicago}`;
});

await step("Chicago search recognises a community area and opens a preview", async () => {
  await search.click();
  await search.fill("coffee in the loop");
  const items = page.locator("div.max-h-60 div.cursor-pointer");
  await items.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  const first = (await items.first().innerText()).trim().split("\n")[0];
  const n = await items.count();
  await shot("04-chicago-search");
  await items.nth(1).click();
  const preview = page.locator(".app-popup");
  await preview.waitFor({ state: "visible", timeout: 20_000 });
  const title = (await preview.locator("h3").first().innerText()).trim();
  await page.waitForTimeout(1500);
  await shot("05-chicago-preview");
  if (!/^Loop/.test(first)) throw new Error(`first row should be the Loop, got ${first}`);
  if (!title) throw new Error("preview has no title");
  return `${n} rows, opened "${title}"`;
});

await step("reload keeps Chicago", async () => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await search.waitFor({ state: "visible", timeout: 90_000 });
  const stored = await page.evaluate(() => localStorage.getItem("map_city"));
  if (stored !== "chicago") throw new Error(`map_city=${stored}`);
  await page.waitForTimeout(1500);
  await shot("06-chicago-reload");
});

await browser.close();
console.log(results.map((r) => r.line).join("\n"));
console.log(JSON.stringify({ tiles, rpc, errors: errors.slice(0, 5) }));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
