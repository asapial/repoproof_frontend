// Backend-owned v1 snapshot; see README.md for synchronization.
export * from "./vendor/v1/repoproof";
import { verificationVerdictSchema } from "./vendor/v1/repoproof";
import type { VerificationVerdict } from "./vendor/v1/repoproof";

export function isVerificationVerdict(value: string): value is VerificationVerdict {
  return verificationVerdictSchema.safeParse(value).success;
}
