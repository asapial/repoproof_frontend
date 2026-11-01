import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeApi, resolveApiOrigin } from "./safeApi";

const fixture = { repositoryId: "repoproof-backend", repository: "asapial/repoproof_backend", fixtureKey: "discount-bug", issueNumber: 1, source: "CURATED" } as const;
afterEach(() => vi.unstubAllGlobals());
describe("safe MVP API client", () => {
  it("uses fixed relative paths with credentials and no-store in same-origin mode", async () => {
    const mock = vi.fn().mockResolvedValue(new Response('{"repositories":[]}')); vi.stubGlobal("fetch", mock);
    expect(await createSafeApi("/").catalog()).toEqual([]);
    expect(mock).toHaveBeenCalledWith("/api/v1/repositories", expect.objectContaining({ credentials: "include", cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(() => createSafeApi("//untrusted.example.test")).toThrow();
  });
  it("validates the API origin without accepting credentials, paths or insecure remote hosts", () => {
    expect(resolveApiOrigin("http://127.0.0.1:5000")).toBe("http://127.0.0.1:5000");
    expect(resolveApiOrigin("https://api.example.test")).toBe("https://api.example.test");
    for (const origin of ["", "http://example.test", "https://user:pass@example.test", "https://api.example.test/path", "javascript:alert(1)"]) expect(() => resolveApiOrigin(origin)).toThrow();
  });
  it("uses credentialed requests and validates public catalog metadata", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ repositories: [fixture] }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    expect(await api.catalog()).toEqual([fixture]);
    expect(mock).toHaveBeenCalledWith("http://127.0.0.1:5000/api/v1/repositories", expect.objectContaining({ credentials: "include", cache: "no-store" }));
  });
  it("rejects malformed and oversized server responses without reflecting them", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ repositories: [{ ...fixture, secret: "private-token" }] }), { status: 200 })).mockResolvedValueOnce(new Response("x".repeat(70000), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    await expect(api.catalog()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.catalog()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("reports unavailable honestly and does not accept a synthetic success as a run", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "RUNNER_UNAVAILABLE", message: "The isolated runner is unavailable", requestId: "req_1" } }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "run_fake" }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    await expect(api.requestRun(fixture)).rejects.toMatchObject({ code: "RUNNER_UNAVAILABLE" });
    await expect(api.requestRun(fixture)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("keeps only public user fields from a valid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { name: "Test", email: "test@example.test", token: "not-for-ui" }, session: { token: "not-for-ui" } }), { status: 200 })));
    expect(await createSafeApi("http://127.0.0.1:5000").session()).toEqual({ name: "Test", email: "test@example.test" });
  });
  it("does not trust malformed session or legacy auth error bodies", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ user: { email: "bad" } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: "private diagnostic" }), { status: 401 }));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    await expect(api.session()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.signIn("user@example.test", "test-only")).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });
  it("saves, loads and deletes a validated user draft", async () => {
    const draft = { repositoryId: fixture.repositoryId, fixtureKey: fixture.fixtureKey, issueNumber: fixture.issueNumber };
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ draft }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ draft }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ draft: null }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    expect(await api.saveDraft(fixture)).toEqual(draft);
    expect(await api.draft()).toEqual(draft);
    await expect(api.deleteDraft()).resolves.toBeUndefined();
    expect(mock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:5000/api/v1/request-draft", expect.objectContaining({ method: "PUT", credentials: "include" }));
    expect(mock).toHaveBeenNthCalledWith(3, "http://127.0.0.1:5000/api/v1/request-draft", expect.objectContaining({ method: "DELETE", credentials: "include" }));
  });
  it("rejects malformed, mismatched and unauthorized draft responses", async () => {
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ draft: { ...fixture, secret: "do-not-show" } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ draft: { repositoryId: "other", fixtureKey: "other", issueNumber: 1 } }), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Authentication required", requestId: "req_1" } }), { status: 401 })).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", mock);
    const api = createSafeApi("http://127.0.0.1:5000");
    await expect(api.draft()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.saveDraft(fixture)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(api.deleteDraft()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(api.draft()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
  it.each(["saveDraft", "deleteDraft", "requestRun"] as const)("recognizes genuine session expiry during %s", async action => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "private diagnostic", requestId: "req_1" } }), { status: 401 })));
    const api = createSafeApi("http://127.0.0.1:5000");
    const operation = action === "deleteDraft" ? api.deleteDraft() : api[action](fixture);
    await expect(operation).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Please sign in again." });
  });
  it("does not classify malformed 401, forbidden or authentication failures as session expiry", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "private" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "private", requestId: "req_1" } }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "private", requestId: "req_1" } }), { status: 401 })));
    const api = createSafeApi("http://127.0.0.1:5000");
    await expect(api.deleteDraft()).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    await expect(api.deleteDraft()).rejects.toMatchObject({ code: "REQUEST_FAILED" });
    await expect(api.signIn("b@example.test", "synthetic")).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });
});
