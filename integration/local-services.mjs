import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.RPF_E2E_DISPOSABLE_CONFIRMED !== "1" || !process.env.REPOPROOF_BACKEND) throw new Error("Confirm a disposable test target and set REPOPROOF_BACKEND");
const frontend = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const backend = realpathSync(process.env.REPOPROOF_BACKEND);
for (const directory of [frontend, backend]) for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (existsSync(resolve(directory, file))) throw new Error("Refusing a checkout with local environment files");
}
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => ["PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "RPF_E2E_CHROME"].includes(name.toUpperCase())));
Object.assign(env, { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "test", PORT: "15440", DATABASE_URL: "postgresql://rpf_test@127.0.0.1:35440/rpf012s_disposable", BETTER_AUTH_SECRET: "synthetic-local-only-session-secret-0123456789", BETTER_AUTH_URL: "http://127.0.0.1:15440", FRONTEND_URL: "http://127.0.0.1:13300", RPF_E2E_FRONTEND: "http://127.0.0.1:13300", RPF_E2E_BACKEND: "http://127.0.0.1:15440", RPF_E2E_DISPOSABLE_CONFIRMED: "1" });
if (process.env.RPF_E2E_SAME_ORIGIN === "1") {
  Object.assign(env, { BETTER_AUTH_URL: env.FRONTEND_URL, RPF_E2E_API_BASE: env.FRONTEND_URL, REPOPROOF_API_ORIGIN: "http://127.0.0.1:15440" });
}
const children = [];
const launch = (args, cwd, overrides = {}) => {
  const child = spawn(process.execPath, args, { cwd, env: { ...env, ...overrides }, stdio: ["ignore", "inherit", "inherit"] });
  children.push(child); return child;
};
const exitOf = child => new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code)); });
const stop = async child => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = exitOf(child); child.kill();
  const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
  try { await ended; } finally { clearTimeout(timer); }
};
const interrupt = () => { for (const child of children) child.kill(); };
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
try {
  for (const port of [13300, 15440]) {
    const probe = createServer();
    await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(port, "127.0.0.1", resolve); });
    await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  }
  // Keep the actual local bundle loopback-only without changing its production
  // entrypoint or accepting a user-supplied script/command.
  const bootstrap = `import { Server } from "node:net"; const listen = Server.prototype.listen; Server.prototype.listen = function(port, ...rest) { return String(port) === "15440" ? listen.call(this, Number(port), "127.0.0.1", ...rest) : listen.call(this, port, ...rest); }; await import(${JSON.stringify(pathToFileURL(resolve(backend, "api/server.js")).href)});`;
  const api = launch(["--input-type=module", "-e", bootstrap], backend);
  const web = launch(["node_modules/next/dist/bin/next", "start", "-p", "13300", "-H", "127.0.0.1"], frontend, { NODE_ENV: "production" });
  for (const [port, child] of [[15440, api], [13300, web]]) {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert.equal(child.exitCode, null, "Local service exited before readiness");
      try { if ((await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Local service did not become ready");
  }
  for (const file of ["safe-mvp.e2e.mjs", "session-recovery.e2e.mjs", "request-deadlines.e2e.mjs"]) {
    const test = launch([resolve(frontend, "integration", file)], frontend);
    const timer = setTimeout(() => test.kill(), 120_000);
    try { assert.equal(await exitOf(test), 0, `${file} failed`); } finally { clearTimeout(timer); }
  }
} finally {
  await Promise.all(children.map(stop));
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
}
