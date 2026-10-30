import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const backend = process.env.REPOPROOF_BACKEND ?? resolve(root, "../repoproof_backend");
const ref = process.env.REPOPROOF_CONTRACT_REF ?? "108095993b26d64108fe127035a7fd72718064c3";
if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error("REPOPROOF_CONTRACT_REF must be a full lowercase commit SHA");
for (const file of ["repoproof.ts", "v1.ts"]) {
  const expected = execFileSync("git", ["-C", backend, "show", `${ref}:src/contracts/${file}`]);
  const actual = readFileSync(resolve(root, "src/contracts/vendor/v1", file));
  if (!actual.equals(expected)) throw new Error(`${file} differs from backend commit ${ref}`);
}
console.log(`Contract snapshot matches backend commit ${ref}`);
