import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.env.npm_execpath || !process.env.REPOPROOF_BACKEND) throw new Error("Set REPOPROOF_BACKEND and run npm run check");
const root = fileURLToPath(new URL("..", import.meta.url));
const contract = spawnSync(process.execPath, [resolve(process.env.REPOPROOF_BACKEND, "scripts/check-contracts.mjs")], { stdio: "inherit", env: { ...process.env, REPOPROOF_FRONTEND: root } });
if (contract.error || contract.status !== 0) process.exit(contract.status ?? 1);
for (const args of [["test", "--", "--maxWorkers=1"], ["run", "lint"], ["run", "typecheck"], ["run", "build"], ["audit", "--json"], ["audit", "--omit=dev", "--json"]]) {
  console.log(`CHECK: npm ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: "inherit" });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}
const toolchain = spawnSync(process.execPath, ["scripts/check-lint-toolchain.mjs"], { stdio: "inherit" });
if (toolchain.error || toolchain.status !== 0) process.exit(toolchain.status ?? 1);
