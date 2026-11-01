import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const frontend = process.env.RPF_E2E_FRONTEND;
const backend = process.env.RPF_E2E_BACKEND;
const apiBase = process.env.RPF_E2E_API_BASE ?? backend;
if (frontend !== "http://127.0.0.1:13300" || backend !== "http://127.0.0.1:15440" || process.env.RPF_E2E_DISPOSABLE_CONFIRMED !== "1") throw new Error("Refusing non-local recovery test");
if (apiBase !== frontend && apiBase !== backend) throw new Error("Refusing non-local API target");
const fixture = { repositoryId: "repoproof-backend", repository: "asapial/repoproof_backend", fixtureKey: "discount-bug", issueNumber: 1, source: "CURATED" };
const draft = { repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber };
const browser = await chromium.launch({ headless: true, executablePath: process.env.RPF_E2E_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
try {
  // Fault injection is deliberately mocked. The separate safe-mvp test uses
  // the actual PostgreSQL-backed API. This test measures browser state recovery.
  for (const [button, method, endpoint] of [["Save draft", "PUT", "/api/v1/request-draft"], ["Delete draft", "DELETE", "/api/v1/request-draft"], ["Request verification", "POST", "/api/v1/runs"]]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    let account = "a", expire = false, denial = 0;
    const headers = { "access-control-allow-origin": frontend, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
    await page.route(`${apiBase}/api/**`, async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let body, status = 200;
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (expire && path === endpoint && request.method() === method) {
        expire = false; account = ""; status = 401;
        body = { error: { code: "UNAUTHENTICATED", message: "PRIVATE-DIAGNOSTIC-A", requestId: "req_expired" } };
      } else if (denial && path === "/api/v1/request-draft" && request.method() === "PUT") {
        status = denial; denial = 0; body = { message: "PRIVATE-DIAGNOSTIC-B" };
      } else if (path === "/api/auth/sign-in/email") { account = "b"; body = {}; }
      else if (path === "/api/auth/get-session") body = account ? { user: { name: account, email: `${account}@example.test` } } : null;
      else if (path === "/api/v1/repositories") body = { repositories: [fixture] };
      else if (path === "/api/v1/request-draft") body = { draft: account === "a" ? draft : null };
      else if (path === "/api/v1/runs") { status = 503; body = { error: { code: "RUNNER_UNAVAILABLE", message: "Unavailable", requestId: "req_unavailable" } }; }
      else throw new Error(`Unexpected test API path: ${path}`);
      await route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });
    });
    try {
      await page.goto(frontend);
      await page.getByText(/Saved draft:/).waitFor();
      expire = true;
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ timeout: 5000 });
      assert.equal(await page.getByText(/Signed in as|Saved draft:|PRIVATE-DIAGNOSTIC/).count(), 0);
      assert.equal(await page.getByLabel("Approved repository").count(), 0);
      assert.equal(await page.getByLabel("Email").inputValue(), "");
      assert.equal(await page.getByLabel("Password").inputValue(), "");
      await page.getByRole("heading", { name: "Fixes deserve proof." }).waitFor();
      await page.getByLabel("Email").fill("b@example.test");
      await page.getByLabel("Password").fill("synthetic-password-123");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.getByText("b@example.test", { exact: true }).waitFor();
      assert.equal(await page.getByText(/Saved draft:|a@example.test/).count(), 0);
      for (const status of [403, 401]) {
        denial = status;
        await page.getByRole("button", { name: "Save draft", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "The request could not be completed." }).waitFor();
        assert.equal(await page.getByText("b@example.test", { exact: true }).count(), 1);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS: ${button} expiry clears private state; account B restores safely; malformed 401/403 keep session`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
