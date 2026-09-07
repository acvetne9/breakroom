// End-to-end smoke test for Workaround against the local dev server + live Supabase.
// Usage: npm run dev (in one terminal) then `npm run test:e2e` (default http://localhost:8080).
// Talks to the live Supabase project with a fresh device id; it creates and then deletes one post + one comment.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8080";
const SHOTS = new URL("../.e2e-shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const tileResponses = { ok: 0, bad: 0 };
let viewportCalls = 0;
let viewportRows = 0;

const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(err?.message ?? err) });
    console.log(`FAIL ${name} — ${err?.message ?? err}`);
  }
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));
page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url().slice(0, 120)} ${req.failure()?.errorText ?? ""}`));
page.on("response", async (res) => {
  if (res.url().includes("/data/tiles/")) (res.ok() ? tileResponses.ok++ : tileResponses.bad++);
  if (res.url().includes("/rpc/get_businesses_in_viewport_slim") && res.ok()) {
    viewportCalls++;
    try {
      viewportRows += (await res.json()).length;
    } catch {
      /* body already consumed */
    }
  }
});

const shot = (name) => page.screenshot({ path: `${SHOTS}${name}.png` });
const marker = `e2e ${Date.now().toString(36)}`;

await step("app loads and map finishes loading", async () => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const search = page.locator('input[placeholder="Find that next gig!"]');
  await search.waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(1500);
  await shot("01-map");
  const deviceId = await page.evaluate(() => localStorage.getItem("device_id"));
  if (!/^[0-9a-f-]{36}$/.test(deviceId ?? "")) throw new Error(`bad device id: ${deviceId}`);
  return `device ${deviceId}, tiles ok=${tileResponses.ok} bad=${tileResponses.bad}`;
});

await step("map received business dots from the viewport RPC", async () => {
  const canvases = await page.locator("canvas").count();
  if (canvases < 1) throw new Error("no canvas");
  const rows = viewportRows;
  if (rows === 0) throw new Error("no businesses returned by get_businesses_in_viewport_slim");
  return `${viewportCalls} viewport calls, ${rows} rows`;
});

let firstBusinessName = "";
await step("search dropdown returns businesses", async () => {
  const search = page.locator('input[placeholder="Find that next gig!"]');
  await search.click();
  await search.fill("coffee");
  const items = page.locator("div.max-h-60 div.cursor-pointer");
  await items.first().waitFor({ state: "visible", timeout: 30_000 });
  const n = await items.count();
  firstBusinessName = (await items.first().locator("span.font-medium").first().innerText()).trim();
  await shot("02-search");
  return `${n} results, first: ${firstBusinessName}`;
});

await step("role search surfaces businesses that only match by role", async () => {
  const search = page.locator('input[placeholder="Find that next gig!"]');
  await search.fill("");
  await search.fill("barista");
  const items = page.locator("div.max-h-60 div.cursor-pointer");
  await items.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  const labels = await items.locator("span.font-medium").allInnerTexts();
  const roleOnly = labels.filter((n) => !/barista/i.test(n));
  await shot("02b-role-search");
  if (roleOnly.length === 0) throw new Error("every result has 'barista' in its name; role matching not surfacing");
  return `${labels.length} results, ${roleOnly.length} matched by role only (e.g. ${roleOnly[0]})`;
});

await step("neighborhood + pay query parses and returns businesses", async () => {
  const search = page.locator('input[placeholder="Find that next gig!"]');
  await search.fill("");
  await search.fill("upper east side over $18/hr");
  const items = page.locator("div.max-h-60 div.cursor-pointer");
  await items.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  const first = (await items.first().innerText()).trim();
  const n = await items.count();
  await shot("02c-neighborhood-pay");
  if (!/Upper East Side/i.test(first)) throw new Error(`first item should be the neighborhood, got: ${first}`);
  if (n < 2) throw new Error("no businesses returned for neighborhood + pay");
  return `${n - 1} businesses in the Upper East Side paying $18+/hr`;
});

await step("selecting a result opens the preview card", async () => {
  const search = page.locator('input[placeholder="Find that next gig!"]');
  await search.fill("");
  await search.fill("coffee");
  await page.locator("div.max-h-60 div.cursor-pointer").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(300);
  await page.locator("div.max-h-60 div.cursor-pointer").first().click();
  const preview = page.locator(".app-popup");
  await preview.waitFor({ state: "visible", timeout: 20_000 });
  const title = (await preview.locator("h3").first().innerText()).trim();
  await shot("03-preview");
  if (!title) throw new Error("preview has no title");
  return `preview for "${title}"`;
});

await step("preview opens details with roles; vote toggles and reverts", async () => {
  await page.locator(".app-popup").click();
  const details = page.locator(".app-card", { hasText: "Roles & Salaries" });
  await details.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500); // let full details (roles with ids) land
  await shot("04-details");
  const upvotes = details.locator("button", { hasText: "✅" });
  const n = await upvotes.count();
  if (n === 0) return "business has no roles; vote not exercised";
  const counter = upvotes.first().locator("xpath=following-sibling::span[1]");
  const before = parseInt((await counter.innerText()).trim(), 10);
  await upvotes.first().click();
  await page.waitForTimeout(800);
  const after = parseInt((await counter.innerText()).trim(), 10);
  await shot("05-voted");
  await upvotes.first().click(); // revert
  await page.waitForTimeout(800);
  const reverted = parseInt((await counter.innerText()).trim(), 10);
  if (after !== before + 1) throw new Error(`vote did not apply: ${before} -> ${after}`);
  if (reverted !== before) throw new Error(`vote did not revert: ${after} -> ${reverted}`);
  return `roles=${n}, count ${before} -> ${after} -> ${reverted}`;
});

await step("close details card", async () => {
  await page.mouse.click(20, 400); // background click
  await page.locator(".app-card", { hasText: "Roles & Salaries" }).waitFor({ state: "hidden", timeout: 10_000 });
});

let postCountBefore = 0;
await step("explore page shows posts and grows on scroll", async () => {
  await page.locator('button[aria-label="Explore"]').click();
  const posts = page.locator(".app-popup-transparent");
  await posts.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  postCountBefore = await posts.count();
  const container = page.locator("div.overflow-y-auto.pb-20").first();
  for (let i = 0; i < 6; i++) {
    await container.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(700);
  }
  const postCountAfter = await posts.count();
  await shot("06-explore");
  if (postCountAfter <= postCountBefore && postCountBefore >= 25) throw new Error(`no growth: ${postCountBefore} -> ${postCountAfter}`);
  return `${postCountBefore} -> ${postCountAfter} posts rendered`;
});

await step("create a story post", async () => {
  const input = page.locator('input[placeholder="How\'s work?"]');
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`${marker} story`);
  await input.press("Enter");
  const post = page.locator(".app-popup-transparent", { hasText: `${marker} story` });
  await post.waitFor({ state: "visible", timeout: 20_000 });
  await shot("07-posted");
});

await step("comment on it and see the comment", async () => {
  const post = page.locator(".app-popup-transparent", { hasText: `${marker} story` });
  await post.click();
  const input = page.locator('input[placeholder="Leave a comment!"]');
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`${marker} comment`);
  await input.press("Enter");
  await post.locator("text=" + `${marker} comment`).waitFor({ state: "visible", timeout: 20_000 });
  await shot("08-comment");
});

await step("delete the comment and the post", async () => {
  const post = page.locator(".app-popup-transparent", { hasText: `${marker} story` });
  const commentRow = post.locator("div.flex.items-center.gap-2.py-2", { hasText: `${marker} comment` });
  const trashComment = commentRow.locator("button", { hasText: "🗑️" });
  await trashComment.click();
  await page.waitForTimeout(300);
  await trashComment.click();
  await commentRow.waitFor({ state: "hidden", timeout: 15_000 });
  const trashPost = post.locator("button", { hasText: "🗑️" }).first();
  await trashPost.click();
  await page.waitForTimeout(300);
  await trashPost.click();
  await post.waitFor({ state: "hidden", timeout: 15_000 });
  await shot("09-deleted");
});

await step("👀 on a post flies the map to its business", async () => {
  const eye = page.locator(".app-popup-transparent button", { hasText: "👀" }).first();
  if ((await eye.count()) === 0) return "no post with a business in view; skipped";
  await eye.click();
  const details = page.locator(".app-card", { hasText: "Roles & Salaries" });
  await details.waitFor({ state: "visible", timeout: 20_000 });
  await shot("10-flyto");
  await page.mouse.click(20, 400);
});

await step("settings page renders editors", async () => {
  await page.locator('button[aria-label="Settings"]').click();
  await page.locator("h2", { hasText: "Current Job" }).waitFor({ state: "visible", timeout: 20_000 });
  const role = page.locator('input[placeholder="Search or select a job role..."]').first();
  await role.fill("Barista");
  const salary = page.locator('input[placeholder="$14.00"]');
  await salary.fill("18.5");
  await salary.blur();
  await page.waitForTimeout(300);
  const shown = await salary.inputValue();
  await shot("11-settings");
  if (shown !== "$18.50") throw new Error(`salary formatting: ${shown}`);
  await page.locator("button", { hasText: "My Stories" }).click();
  await page.waitForTimeout(300);
  return "role + salary typed, salary formatted to $18.50 (form left incomplete on purpose, nothing saved)";
});

await step("back to the map", async () => {
  await page.locator('button[aria-label="Map"]').click();
  await page.locator('input[placeholder="Find that next gig!"]').waitFor({ state: "visible", timeout: 10_000 });
});

await browser.close();

console.log("\n==== SUMMARY ====");
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, tileResponses, consoleErrors, pageErrors, failedRequests: failedRequests.slice(0, 10) }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
