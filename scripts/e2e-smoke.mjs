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
    console.log(`FAIL ${name} — ${String(err?.message ?? err).split("\n")[0]}`);
    try {
      await page.screenshot({ path: `${SHOTS}fail-${results.length}.png` });
    } catch {
      /* page may be gone */
    }
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
  await page.waitForTimeout(300);
  await search.click();
  await search.type("barista", { delay: 30 });
  const items = page.locator("div.max-h-60 div.cursor-pointer");
  // Results replace the "Searching…" row asynchronously; poll until the list has settled.
  let labels = [];
  for (let i = 0; i < 40 && labels.length < 5; i++) {
    await page.waitForTimeout(250);
    labels = await items.locator("span.font-medium").allInnerTexts();
  }
  const roleOnly = labels.filter((n) => !/barista/i.test(n));
  await shot("02b-role-search");
  if (roleOnly.length === 0) throw new Error(`every result has 'barista' in its name; saw: ${labels.slice(0, 8).join(" | ")}`);
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

await step("details card: add a role, then report a problem", async () => {
  const details = page.locator(".app-card", { hasText: "Roles & Salaries" });
  const rolesBefore = await details.locator("button", { hasText: "✅" }).count();
  await details.locator('button[aria-label="Is this business accurate?"]').click();
  const panel = details.locator("form");
  await panel.waitFor({ state: "visible", timeout: 10_000 });

  await panel.locator("button", { hasText: "Add a role & pay" }).click();
  await panel.locator('input[placeholder="Job role..."]').fill(`${marker} role`);
  await panel.locator('input[placeholder="$18.00"]').fill("19");
  await panel.locator('button[type="submit"]').click();
  await page.locator("text=Added").first().waitFor({ state: "visible", timeout: 15_000 });
  await details.locator("text=" + `${marker} role`).waitFor({ state: "visible", timeout: 15_000 });
  const rolesAfter = await details.locator("button", { hasText: "✅" }).count();
  if (rolesAfter !== rolesBefore + 1) throw new Error(`role count ${rolesBefore} -> ${rolesAfter}`);

  await details.locator('button[aria-label="Is this business accurate?"]').click();
  await panel.waitFor({ state: "visible", timeout: 10_000 });
  await panel.locator("select").selectOption("closed");
  await panel.locator("textarea").fill(`${marker} report`);
  await panel.locator('button[type="submit"]').click();
  await page.locator("text=Thanks, we'll take a look.").waitFor({ state: "visible", timeout: 15_000 });
  await shot("05b-feedback");
  return `role added (${rolesBefore} -> ${rolesAfter}) and report sent`;
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

await step("settings: complete the current job, retire it, then hide it", async () => {
  await page.locator('button[aria-label="Settings"]').click();
  await page.locator("h2", { hasText: "Current Job" }).waitFor({ state: "visible", timeout: 20_000 });

  // Pick a business from the dropdown so the job is "selected", then role + pay.
  const business = page.locator('input[placeholder="Where do you work?..."]');
  await business.click();
  await business.type("coffee", { delay: 40 });
  const option = page.locator("div.max-h-60 div.cursor-pointer").first();
  await option.waitFor({ state: "visible", timeout: 30_000 });
  await option.click();
  await page.locator('input[placeholder="Search or select a job role..."]').first().fill("Barista");
  const salary = page.locator('input[placeholder="$14.00"]');
  await salary.fill("18.5");
  await salary.blur();
  if ((await salary.inputValue()) !== "$18.50") throw new Error(`salary formatting: ${await salary.inputValue()}`);

  const move = page.locator("button", { hasText: "Move to past jobs" });
  await page.waitForTimeout(1800); // let the debounced save land
  await move.waitFor({ state: "visible" });
  if (await move.isDisabled()) throw new Error("Move to past jobs stayed disabled after completing the job");
  await move.click();
  await page.locator("text=Moved to past jobs").waitFor({ state: "visible", timeout: 15_000 });
  await shot("11-retired");

  const pastRole = page.locator('input[placeholder="Search or select a job role..."]').nth(1);
  await pastRole.waitFor({ state: "visible", timeout: 10_000 });
  const pastRoleValue = await pastRole.inputValue();
  if (!/barista/i.test(pastRoleValue)) throw new Error(`past job role is "${pastRoleValue}"`);
  const currentRole = await page.locator('input[placeholder="Search or select a job role..."]').first().inputValue();
  if (currentRole) throw new Error(`current job not cleared: "${currentRole}"`);

  await page.locator('button[aria-label="Remove past job"]').first().click();
  await page.waitForTimeout(1200);
  const remaining = await page.locator('button[aria-label="Remove past job"]').count();
  await shot("12-hidden");
  if (remaining !== 0) throw new Error(`past job still visible after hide (${remaining})`);

  await page.locator("button", { hasText: "My Stories" }).click();
  await page.locator("text=No stories or comments yet").waitFor({ state: "visible", timeout: 15_000 });
  return "job completed, auto-saved, retired to past jobs, then hidden; My Stories loaded from the database";
});

await step("My Stories in Settings lists a post and opens the complete feed filter", async () => {
  // Write a story in Explore, then find it from Settings and tap through to the feed filter.
  await page.locator('button[aria-label="Explore"]').click();
  const input = page.locator('input[placeholder="How\'s work?"]');
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(`${marker} mine`);
  await input.press("Enter");
  await page.locator(".app-popup-transparent", { hasText: `${marker} mine` }).waitFor({ state: "visible", timeout: 20_000 });

  await page.locator('button[aria-label="Settings"]').click();
  await page.locator("h2", { hasText: "Current Job" }).waitFor({ state: "visible", timeout: 20_000 });
  const toggle = page.locator("button", { hasText: "My Stories" });
  if (!(await page.locator(".story-item").count())) await toggle.click();
  const entry = page.locator(".story-item", { hasText: `${marker} mine` });
  await entry.waitFor({ state: "visible", timeout: 20_000 });
  await entry.click();

  await page.locator("h2", { hasText: "My Stories" }).waitFor({ state: "visible", timeout: 20_000 });
  const inFeed = page.locator(".app-popup-transparent", { hasText: `${marker} mine` });
  await inFeed.waitFor({ state: "visible", timeout: 20_000 });
  const others = await page.locator(".app-popup-transparent").count();
  await shot("13-my-stories-feed");

  const trash = inFeed.locator("button", { hasText: "🗑️" }).first();
  await trash.click();
  await page.waitForTimeout(300);
  await trash.click();
  await inFeed.waitFor({ state: "hidden", timeout: 15_000 });
  await page.locator("button", { hasText: "← Back" }).click();
  if (others !== 1) throw new Error(`My Stories feed showed ${others} posts for a device with one story`);
  return "story visible in Settings, feed filter showed only the device's own post";
});

await step("back to the map", async () => {
  await page.locator('button[aria-label="Map"]').click();
  await page.locator('input[placeholder="Find that next gig!"]').waitFor({ state: "visible", timeout: 10_000 });
});

await browser.close();

console.log("\n==== SUMMARY ====");
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, tileResponses, consoleErrors, pageErrors, failedRequests: failedRequests.slice(0, 10) }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
