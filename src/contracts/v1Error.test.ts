import { describe, expect, it } from "vitest";
import { parseV1Error } from "./v1Error";

describe("v1 client error validation", () => {
  it("accepts a backend-compatible error envelope", () => {
    expect(parseV1Error({ error: { code: "ORIGIN_REQUIRED", message: "Origin required for cookie-authenticated requests", requestId: "req_123" } })).toEqual({ kind: "api", code: "ORIGIN_REQUIRED", message: "Origin required for cookie-authenticated requests", requestId: "req_123" });
  });
  it("rejects malformed, legacy and oversized or secret-bearing extra fields without echoing them", () => {
    for (const input of [null, { message: "secret" }, { error: { code: "bad", message: "secret", requestId: "req" } }, { error: { code: "INVALID_INPUT", message: "bad", requestId: "req", stack: "secret" } }, { error: { code: "INVALID_INPUT", message: "bad", requestId: "x".repeat(129) } }]) {
      const result = parseV1Error(input);
      expect(result).toEqual({ kind: "invalid_response", message: "The server returned an invalid error response." });
      expect(JSON.stringify(result)).not.toContain("secret");
    }
  });
});
