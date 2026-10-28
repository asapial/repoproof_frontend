import { describe, expect, it } from "vitest";
import {
  RUN_STATES,
  TERMINAL_RUN_STATES,
  TEST_OUTCOMES,
  TEST_PHASES,
  VERIFICATION_VERDICTS,
  isTerminalRunState,
  isVerificationVerdict,
} from "./repoproof";

// These expectations duplicate the backend contract tests on purpose: the
// frontend mirror must not drift from the authoritative backend values.
describe("frontend contract mirror", () => {
  it("matches the documented run states", () => {
    expect(RUN_STATES).toEqual([
      "CREATED",
      "ANALYZING",
      "AWAITING_APPROVAL",
      "QUEUED",
      "PREPARING",
      "GENERATING_REPRO",
      "BASELINING",
      "PATCHING",
      "VERIFYING",
      "REPORTING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ]);
    expect(TERMINAL_RUN_STATES).toEqual(["COMPLETED", "FAILED", "CANCELLED"]);
    expect(isTerminalRunState("COMPLETED")).toBe(true);
    expect(isTerminalRunState("QUEUED")).toBe(false);
  });

  it("matches the four deterministic verdicts", () => {
    expect(VERIFICATION_VERDICTS).toEqual([
      "VERIFIED",
      "REJECTED",
      "NO_REPRO",
      "INCONCLUSIVE",
    ]);
    expect(isVerificationVerdict("VERIFIED")).toBe(true);
    expect(isVerificationVerdict("FIXED")).toBe(false);
  });

  it("matches test phases and outcomes", () => {
    expect(TEST_PHASES).toEqual([
      "BASELINE_REPRO",
      "BASELINE_REGRESSION",
      "PATCHED_REPRO",
      "PATCHED_REGRESSION",
    ]);
    expect(TEST_OUTCOMES).toEqual([
      "PASSED",
      "FAILED",
      "ERROR",
      "TIMEOUT",
      "SKIPPED",
      "NO_TESTS",
    ]);
  });
});
