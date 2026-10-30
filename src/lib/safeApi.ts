import { z } from "zod";
import { safeFixtureCatalogSchema, type SafeFixture } from "../contracts/vendor/v1/safeMvp";
import { createRunRequestSchema } from "../contracts/v1";
import { parseV1Error } from "../contracts/v1Error";

const MAX_RESPONSE_BYTES = 64 * 1024;
const sessionSchema = z.object({ user: z.object({ name: z.string().min(1).max(200), email: z.string().email().max(320) }).passthrough() }).passthrough().nullable();

export class ApiFailure extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ApiFailure"; }
}
const invalidResponse = () => new ApiFailure("INVALID_RESPONSE", "The server returned an unexpected response.");

export function resolveApiOrigin(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiFailure("CONFIG_ERROR", "Configure the backend address."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ApiFailure("CONFIG_ERROR", "Use an HTTPS backend origin or a local HTTP origin.");
  return url.origin;
}

async function readJson(response: Response): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) throw invalidResponse();
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw invalidResponse(); }
      chunks.push(item.value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw invalidResponse();
  } finally { reader.releaseLock(); }
}

export function createSafeApi(baseUrl: string) {
  const origin = resolveApiOrigin(baseUrl);
  async function request(path: string, options: { method?: "GET" | "POST"; body?: unknown; auth?: boolean } = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${origin}${path}`, { method: options.method ?? "GET", credentials: "include", cache: "no-store", ...(options.body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }) });
    } catch { throw new ApiFailure("NETWORK_ERROR", "Cannot reach the backend. Check its address and connection."); }
    const data = await readJson(response);
    if (!response.ok) {
      if (options.auth) throw new ApiFailure("AUTH_FAILED", "Authentication failed. Check your details and try again.");
      const parsed = parseV1Error(data);
      if (response.status === 503 && parsed.kind === "api" && parsed.code === "RUNNER_UNAVAILABLE") throw new ApiFailure("RUNNER_UNAVAILABLE", "The runner is unavailable. No run was created.");
      if (response.status === 401 && parsed.kind === "api" && parsed.code === "UNAUTHENTICATED") throw new ApiFailure("UNAUTHENTICATED", "Please sign in again.");
      throw new ApiFailure("REQUEST_FAILED", "The request could not be completed.");
    }
    return data;
  }
  return {
    async session() {
      const result = sessionSchema.safeParse(await request("/api/auth/get-session"));
      if (!result.success) throw invalidResponse();
      return result.data ? { name: result.data.user.name, email: result.data.user.email } : null;
    },
    async signIn(email: string, password: string) { await request("/api/auth/sign-in/email", { method: "POST", body: { email, password }, auth: true }); },
    async signUp(name: string, email: string, password: string) { await request("/api/auth/sign-up/email", { method: "POST", body: { name, email, password }, auth: true }); },
    async signOut() { await request("/api/auth/sign-out", { method: "POST", body: {}, auth: true }); },
    async catalog() {
      const result = safeFixtureCatalogSchema.safeParse(await request("/api/v1/repositories"));
      if (!result.success) throw invalidResponse();
      return result.data.repositories;
    },
    async requestRun(fixture: SafeFixture): Promise<never> {
      const body = createRunRequestSchema.parse({ repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber });
      await request("/api/v1/runs", { method: "POST", body });
      throw invalidResponse();
    },
  };
}
