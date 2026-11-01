import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const frontend = process.env.RPF_E2E_FRONTEND, backend = process.env.RPF_E2E_BACKEND;
if (frontend !== "http://127.0.0.1:13300" || backend !== "http://127.0.0.1:15440" || process.env.RPF_E2E_DISPOSABLE_CONFIRMED !== "1") throw new Error("Refusing non-local deadline test");
const browser = await chromium.launch({ headless: true, executablePath: process.env.RPF_E2E_CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
const context = await browser.newContext();
try {
  const page = await context.newPage();
  await page.clock.install();
  // Controlled transport fault injection only; no production test switch.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.__rpfDeadlineCase = ""; window.__rpfStalledRequests = 0; window.__rpfCancelledStreams = 0;
    window.fetch = (input, options) => {
      if (String(input).endsWith("/api/v1/request-draft") && options?.method === "PUT" && window.__rpfDeadlineCase) {
        window.__rpfStalledRequests++;
        if (window.__rpfDeadlineCase === "headers") return new Promise(() => {});
        return Promise.resolve(new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode('{"draft":')); },
          cancel() { window.__rpfCancelledStreams++; },
        })));
      }
      return original(input, options);
    };
  });
  const fixture = { repositoryId: "repoproof-backend", repository: "asapial/repoproof_backend", fixtureKey: "discount-bug", issueNumber: 1, source: "CURATED" };
  const draft = { repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber };
  const headers = { "access-control-allow-origin": frontend, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,PUT,OPTIONS" };
  let saved = null;
  await page.route(`${backend}/**`, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body;
    if (path === "/api/auth/get-session") body = { user: { name: "Synthetic", email: "synthetic@example.test" } };
    else if (path === "/api/v1/repositories") body = { repositories: [fixture] };
    else if (path === "/api/v1/request-draft") { if (request.method() === "PUT") saved = draft; body = { draft: saved }; }
    else throw new Error(`Unexpected test API path: ${path}`);
    await route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto(frontend);
  await page.getByRole("heading", { name: "Choose a fixture" }).waitFor();
  for (const [index, kind] of ["headers", "body"].entries()) {
    await page.evaluate(kind => { window.__rpfDeadlineCase = kind; }, kind);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.waitForFunction(count => window.__rpfStalledRequests === count, index + 1);
    await page.clock.fastForward(15_001);
    await page.getByRole("status").filter({ hasText: "The request timed out. Try again." }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save draft", exact: true }).isEnabled(), true);
    assert.equal(await page.getByText("synthetic@example.test", { exact: true }).count(), 1);
    await page.evaluate(() => { window.__rpfDeadlineCase = ""; });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Draft saved. No run was created." }).waitFor();
    console.log(`PASS: stalled ${kind} times out, releases UI and permits draft retry`);
  }
  assert.equal(await page.evaluate(() => window.__rpfCancelledStreams), 1);
} finally { await context.close(); await browser.close(); }
