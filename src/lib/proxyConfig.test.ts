import { expect, it } from "vitest";
import { apiProxyRewrites } from "./proxyConfig";

it("routes only fixed API paths to the exact configured backend", () => {
  expect(apiProxyRewrites("https://api.example.test", undefined, true)).toEqual([{ source: "/api/:path*", destination: "https://api.example.test/api/:path*" }]);
  expect(apiProxyRewrites("http://127.0.0.1:15440", "/", false)[0]?.destination).toBe("http://127.0.0.1:15440/api/:path*");
});
it("rejects credentials, arbitrary paths, wildcard origins and insecure cloud routing", () => {
  for (const value of ["https://user:private@api.example.test", "https://api.example.test/path", "https://api.example.test?secret=x", "https://*.example.test", "http://api.example.test", "http://127.0.0.1:15440", "https://api.example.test\n"]) expect(() => apiProxyRewrites(value, undefined, true)).toThrow();
  expect(() => apiProxyRewrites(undefined, undefined, true)).toThrow("REPOPROOF_API_ORIGIN");
  expect(() => apiProxyRewrites("https://api.example.test", "https://other.example.test", true)).toThrow("NEXT_PUBLIC_API_BASE_URL");
});
it("keeps explicit local direct mode and redacts invalid origin values", () => {
  expect.assertions(2);
  expect(apiProxyRewrites(undefined, "http://localhost:5000", false)).toEqual([]);
  try { apiProxyRewrites("https://user:private-value@api.example.test", undefined, true); }
  catch (error) { expect(String(error)).not.toContain("private-value"); }
});
