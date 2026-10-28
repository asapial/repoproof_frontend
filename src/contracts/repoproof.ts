// Mirror of repoproof_backend/src/contracts/repoproof.ts (backend copy is
// authoritative). Keep values identical in both applications; change both
// copies in the same commit. This file intentionally has no backend imports.

export const RUN_STATES = [
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
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_RUN_STATES = ["COMPLETED", "FAILED", "CANCELLED"] as const;

export type TerminalRunState = (typeof TERMINAL_RUN_STATES)[number];

export const VERIFICATION_VERDICTS = [
  "VERIFIED",
  "REJECTED",
  "NO_REPRO",
  "INCONCLUSIVE",
] as const;

export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

export const REPRODUCER_ORIGINS = ["MODEL_GENERATED", "CURATED"] as const;

export type ReproducerOrigin = (typeof REPRODUCER_ORIGINS)[number];

export const TEST_PHASES = [
  "BASELINE_REPRO",
  "BASELINE_REGRESSION",
  "PATCHED_REPRO",
  "PATCHED_REGRESSION",
] as const;

export type TestPhase = (typeof TEST_PHASES)[number];

export const TEST_OUTCOMES = [
  "PASSED",
  "FAILED",
  "ERROR",
  "TIMEOUT",
  "SKIPPED",
  "NO_TESTS",
] as const;

export type TestOutcome = (typeof TEST_OUTCOMES)[number];

const terminalRunStates: ReadonlySet<RunState> = new Set(TERMINAL_RUN_STATES);

export function isTerminalRunState(state: RunState): boolean {
  return terminalRunStates.has(state);
}

export function isVerificationVerdict(value: string): value is VerificationVerdict {
  return (VERIFICATION_VERDICTS as readonly string[]).includes(value);
}
