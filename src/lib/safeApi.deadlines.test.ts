import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeApi } from "./safeApi";

const origin = "http://127.0.0.1:5000";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded API requests", () => {
  it("bounds stalled headers, aborts transport and permits a fresh retry", async () => {
    vi.useFakeTimers();
    const transport = vi.fn().mockImplementationOnce(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(new Response(JSON.stringify({ repositories: [] })));
    vi.stubGlobal("fetch", transport);
    const api = createSafeApi(origin, { timeoutMs: 25 });
    const result = expect(api.catalog()).rejects.toMatchObject({ code: "API_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25); await result;
    expect(transport.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(await api.catalog()).toEqual([]);
    expect(transport.mock.calls[1]?.[1].signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a stalled body even when stream cancellation never settles", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"repositories":')); }, cancel });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream)));
    const result = expect(createSafeApi(origin, { timeoutMs: 25 }).catalog()).rejects.toMatchObject({ code: "API_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25); await result;
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it("uses one deadline across headers and streamed body", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => setTimeout(() => resolve(new Response(stream)), 20))));
    const result = expect(createSafeApi(origin, { timeoutMs: 25 }).catalog()).rejects.toMatchObject({ code: "API_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25); await result;
    expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels active headers and rejects already-aborted requests without fetching", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", transport);
    const api = createSafeApi(origin, { timeoutMs: 25 }), controller = new AbortController();
    const result = expect(api.catalog({ signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    controller.abort(); await result;
    await expect(api.catalog({ signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    expect(transport).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels every pending request during component cleanup and remains reusable", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>();
    const transport = vi.fn().mockImplementationOnce(() => new Promise<Response>(() => {})).mockResolvedValueOnce(new Response(stream)).mockResolvedValueOnce(new Response('{"draft":null}'));
    vi.stubGlobal("fetch", transport);
    const api = createSafeApi(origin);
    const headers = expect(api.session()).rejects.toMatchObject({ code: "ABORTED" });
    const body = expect(api.catalog()).rejects.toMatchObject({ code: "ABORTED" });
    await vi.advanceTimersByTimeAsync(0); api.cancelPending();
    await Promise.all([headers, body]);
    expect(stream.locked).toBe(false); expect(await api.draft()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a late response from a transport that ignored abort", async () => {
    vi.useFakeTimers();
    let deliver: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; })));
    const result = expect(createSafeApi(origin, { timeoutMs: 25 }).catalog()).rejects.toMatchObject({ code: "API_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(25); await result;
    const cancel = vi.fn(); deliver(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves byte limits, response validation and successful-request cleanup", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "content-length": "65537" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "€".repeat(23000) })))
      .mockResolvedValueOnce(new Response("invalid json"))
      .mockResolvedValueOnce(new Response('{"repositories":[]}')));
    const api = createSafeApi(origin);
    for (let i = 0; i < 3; i++) await expect(api.catalog()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(cancel).toHaveBeenCalledOnce(); expect(await api.catalog()).toEqual([]); expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects invalid deadline configuration", () => {
    for (const timeoutMs of [0, -1, NaN, Infinity, 1.5, 60_001]) expect(() => createSafeApi(origin, { timeoutMs })).toThrow("deadline");
  });
});
