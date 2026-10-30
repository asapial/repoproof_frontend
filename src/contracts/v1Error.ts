import { errorResponseSchema } from "./v1";

export type V1ClientError =
  | { kind: "api"; code: string; message: string; requestId: string }
  | { kind: "invalid_response"; message: string };

// Parse unknown server input before presenting it. Never echo malformed responses.
export function parseV1Error(input: unknown): V1ClientError {
  const result = errorResponseSchema.safeParse(input);
  if (!result.success) return { kind: "invalid_response", message: "The server returned an invalid error response." };
  return { kind: "api", ...result.data.error };
}
