import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Never point this test at a real user environment or a non-local service.
const frontend = process.env.RPF_E2E_FRONTEND;
const backend = process.env.RPF_E2E_BACKEND;
const apiBase = process.env.RPF_E2E_API_BASE ?? backend;
if (frontend !== "http://127.0.0.1:13300" || backend !== "http://127.0.0.1:15440" || process.env.RPF_E2E_DISPOSABLE_CONFIRMED !== "1") throw new Error("Refusing non-disposable E2E target");
if (apiBase !== frontend && apiBase !== backend) throw new Error("Refusing non-local API target");
const browser = await chromium.launch({ headless: true, executablePath: process.env.RPF_E2E_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
try {
  const email = `safe-${randomUUID()}@example.test`;
  const password = "synthetic-password-123";
  await page.goto(frontend, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Display name").fill("Synthetic User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("heading", { name: "Choose a fixture" }).waitFor({ timeout: 15000 });
  if (apiBase === frontend) {
    const privateResponse = await page.request.get(`${frontend}/api/v1/request-draft`);
    assert.equal(privateResponse.status(), 200);
    // Upstream may replace our header with its stricter no-store directive.
    assert.match(privateResponse.headers()["cache-control"] ?? "", /(?:^|,\s*)no-store(?:,|$)/);
    const denied = await page.request.delete(`${frontend}/api/v1/request-draft`, { headers: { origin: "https://evil.example.test" } });
    assert.equal(denied.status(), 403);
    const csrf = await page.request.delete(`${frontend}/api/v1/request-draft`); assert.equal(csrf.status(), 403);
    const cookie = (await context.cookies(frontend)).find(value => value.name === "better-auth.session_token");
    assert.ok(cookie); assert.equal(cookie.domain, "127.0.0.1"); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "Lax");
  }
  assert.match(await page.getByLabel("Approved repository").innerText(), /asapial\/repoproof_backend.*issue #1/);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved. No run was created." }).waitFor();
  await page.getByText(/Saved draft:.*This is not a run/).waitFor();
  const unavailable = page.waitForResponse(r => r.url() === `${apiBase}/api/v1/runs` && r.request().method() === "POST");
  await page.getByRole("button", { name: "Request verification" }).click();
  assert.equal((await unavailable).status(), 503);
  await page.getByRole("status").filter({ hasText: "No run was created" }).waitFor();
  assert.equal(await page.getByText(/VERIFIED|REJECTED|NO_REPRO|INCONCLUSIVE/).count(), 0);
  const storage = await page.evaluate(() => ({ keys: Object.keys(localStorage), cookie: document.cookie }));
  assert.ok(!storage.keys.some(key => /token|session|password/i.test(key)));
  assert.doesNotMatch(storage.cookie, /session_token/);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose a fixture" }).waitFor();
  await page.getByText(/Saved draft:.*This is not a run/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: process.env.RPF_E2E_SCREENSHOT ?? join(tmpdir(), `rpf013d-mobile-${randomUUID()}.png`), fullPage: true });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Authentication failed" }).waitFor();
  assert.equal(await page.getByLabel("Password").inputValue(), "");
  assert.equal(await page.getByLabel("Email").inputValue(), email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Choose a fixture" }).waitFor();
  await page.getByText(/Saved draft:.*This is not a run/).waitFor();
  await page.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("status").filter({ hasText: "Draft deleted." }).waitFor();
  assert.equal(await page.getByText(/Saved draft:/).count(), 0);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Choose a fixture" }).waitFor();
  assert.equal(await page.getByText(/Saved draft:/).count(), 0);
  console.log("PASS: production frontend; draft save/reload/sign-in/delete; real HTTP signup, session, catalog, unavailable 503, reload, signout, rejected and successful login; mobile layout");
} finally { await context.close(); await browser.close(); }
