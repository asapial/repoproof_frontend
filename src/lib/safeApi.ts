import { z } from "zod";
import { safeFixtureCatalogSchema, type SafeFixture } from "../contracts/vendor/v1/safeMvp";
import { createRunRequestSchema } from "../contracts/v1";
import { requestDraftSchema, requestDraftResponseSchema, type RequestDraftInput } from "../contracts/vendor/v1/requestDraft";
import { parseV1Error } from "../contracts/v1Error";

const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
type RequestControl = { signal?: AbortSignal };
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

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void operation.catch(() => {}); return Promise.reject(new DOMException("Aborted", "AbortError")); }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) abort(); else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {}); throw invalidResponse();
  }
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  let complete = false;
  try {
    while (true) {
      const item = await withAbort(reader.read(), signal);
      if (item.done) { complete = true; break; }
      size += item.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw invalidResponse();
      chunks.push(item.value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown;
  } catch (error) {
    if (signal.aborted || error instanceof ApiFailure) throw error;
    throw invalidResponse();
  } finally {
    // A hostile stream's cancellation promise must not extend our deadline.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createSafeApi(baseUrl: string, settings: { timeoutMs?: number } = {}) {
  const origin = resolveApiOrigin(baseUrl);
  const timeoutMs = settings.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new ApiFailure("CONFIG_ERROR", "Invalid request deadline.");
  const pending = new Set<AbortController>();
  async function request(path: string, options: RequestControl & { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; auth?: boolean } = {}): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    let timedOut = false;
    pending.add(controller);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const transport = fetch(`${origin}${path}`, { method: options.method ?? "GET", credentials: "include", cache: "no-store", signal: controller.signal, ...(options.body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(options.body) }) });
      void transport.then(response => { if (controller.signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
      const response = await withAbort(transport, controller.signal);
      const data = await readJson(response, controller.signal);
      if (!response.ok) {
        if (options.auth) throw new ApiFailure("AUTH_FAILED", "Authentication failed. Check your details and try again.");
        const parsed = parseV1Error(data);
        if (response.status === 503 && parsed.kind === "api" && parsed.code === "RUNNER_UNAVAILABLE") throw new ApiFailure("RUNNER_UNAVAILABLE", "The runner is unavailable. No run was created.");
        if (response.status === 401 && parsed.kind === "api" && parsed.code === "UNAUTHENTICATED") throw new ApiFailure("UNAUTHENTICATED", "Please sign in again.");
        throw new ApiFailure("REQUEST_FAILED", "The request could not be completed.");
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new ApiFailure(timedOut ? "API_TIMEOUT" : "ABORTED", timedOut ? "The request timed out. Try again." : "The request was cancelled. Try again.");
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure("NETWORK_ERROR", "Cannot reach the backend. Check its address and connection.");
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener("abort", abort); pending.delete(controller);
    }
  }
  return {
    cancelPending() { for (const controller of pending) controller.abort(); },
    async session(control: RequestControl = {}) {
      const result = sessionSchema.safeParse(await request("/api/auth/get-session", control));
      if (!result.success) throw invalidResponse();
      return result.data ? { name: result.data.user.name, email: result.data.user.email } : null;
    },
    async signIn(email: string, password: string, control: RequestControl = {}) { await request("/api/auth/sign-in/email", { ...control, method: "POST", body: { email, password }, auth: true }); },
    async signUp(name: string, email: string, password: string, control: RequestControl = {}) { await request("/api/auth/sign-up/email", { ...control, method: "POST", body: { name, email, password }, auth: true }); },
    async signOut(control: RequestControl = {}) { await request("/api/auth/sign-out", { ...control, method: "POST", body: {}, auth: true }); },
    async catalog(control: RequestControl = {}) {
      const result = safeFixtureCatalogSchema.safeParse(await request("/api/v1/repositories", control));
      if (!result.success) throw invalidResponse();
      return result.data.repositories;
    },
    async draft(control: RequestControl = {}): Promise<RequestDraftInput | null> {
      const result = requestDraftResponseSchema.safeParse(await request("/api/v1/request-draft", control));
      if (!result.success) throw invalidResponse();
      return result.data.draft;
    },
    async saveDraft(fixture: SafeFixture, control: RequestControl = {}): Promise<RequestDraftInput> {
      const body = requestDraftSchema.parse({ repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber });
      const result = requestDraftResponseSchema.safeParse(await request("/api/v1/request-draft", { ...control, method: "PUT", body }));
      if (!result.success || !result.data.draft || result.data.draft.repositoryId !== body.repositoryId || result.data.draft.fixtureKey !== body.fixtureKey || result.data.draft.issueNumber !== body.issueNumber) throw invalidResponse();
      return result.data.draft;
    },
    async deleteDraft(control: RequestControl = {}): Promise<void> {
      const result = requestDraftResponseSchema.safeParse(await request("/api/v1/request-draft", { ...control, method: "DELETE" }));
      if (!result.success || result.data.draft !== null) throw invalidResponse();
    },
    async requestRun(fixture: SafeFixture, control: RequestControl = {}): Promise<never> {
      const body = createRunRequestSchema.parse({ repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber });
      await request("/api/v1/runs", { ...control, method: "POST", body });
      throw invalidResponse();
    },
  };
}
