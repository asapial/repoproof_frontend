import { describe, expect, it } from "vitest";
import { approvalHeadersSchema, createRunRequestSchema, createRunResponseSchema, errorResponseSchema, eventsQuerySchema, eventsResponseSchema, reportResponseSchema } from "./v1";
import type { CreateRunRequest, CreateRunResponse } from "./v1";

describe("v1 contract snapshot", () => {
  it("validates typed create requests and responses", () => {
    const request: CreateRunRequest = { repositoryId: "fixture_1", issueNumber: 12, fixtureKey: "discount-bug" };
    const response: CreateRunResponse = { id: "run_1", state: "ANALYZING", baseSha: "a".repeat(40), repository: "owner/repo", issueNumber: 12, links: { self: "/api/v1/runs/run_1" } };
    expect(createRunRequestSchema.parse(request)).toEqual(request);
    expect(createRunResponseSchema.parse(response)).toEqual(response);
    expect(createRunRequestSchema.safeParse({ ...request, issueNumber: 0 }).success).toBe(false);
    expect(createRunRequestSchema.safeParse({ ...request, repositoryId: "../bad" }).success).toBe(false);
    expect(createRunResponseSchema.safeParse({ ...response, state: "DONE" }).success).toBe(false);
  });
  it("rejects malformed errors and event cursors", () => {
    expect(errorResponseSchema.safeParse({ error: { code: "INVALID_INPUT", message: "Invalid", requestId: "req_1" } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: "invalid", message: "", requestId: "req_1" } }).success).toBe(false);
    expect(eventsQuerySchema.parse({ afterSeq: "5" }).afterSeq).toBe(5);
    expect(eventsQuerySchema.safeParse({ afterSeq: "-1" }).success).toBe(false);
    const event = { seq: 6, stage: "BASELINING", type: "TEST", title: "Test", detail: {}, at: "2026-10-31T08:10:00Z" };
    expect(eventsResponseSchema.safeParse({ runId: "run_1", events: [event], nextCursor: 6, terminal: false }).success).toBe(true);
    expect(eventsResponseSchema.safeParse({ runId: "run_1", events: [{ ...event, detail: { nested: [{ valid: true }] } }], nextCursor: 6, terminal: false }).success).toBe(true);
    expect(eventsResponseSchema.safeParse({ runId: "run_1", events: [{ ...event, detail: { invalid: Infinity } }], nextCursor: 6, terminal: false }).success).toBe(false);
    expect(approvalHeadersSchema.safeParse({ "idempotency-key": "11111111-1111-1111-1111-111111111111" }).success).toBe(true);
    expect(eventsResponseSchema.safeParse({ runId: "run_1", events: [event], nextCursor: 5, terminal: false }).success).toBe(false);
  });
  it("rejects incomplete reports rather than inventing evidence", () => {
    expect(reportResponseSchema.safeParse({ runId: "run_1", state: "COMPLETED", verdict: "VERIFIED" }).success).toBe(false);
  });
});
