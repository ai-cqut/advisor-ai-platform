import assert from "node:assert/strict";
import test from "node:test";
import { IntentRouter } from "../dist/routing/core/IntentRouter.js";
import { IntentRouteDecision } from "../dist/routing/model/IntentRouteDecision.js";
import { AgentContextPipeline } from "../dist/app/session/core/pipeline/AgentContextPipeline.js";

test("intent router accepts strong document rules", () => {
  const decision = new IntentRouter().route("请根据知识库文档解释这个问题", ["retrieval", "search"]);
  assert.deepEqual([...decision.categories], ["retrieval"]);
  assert.equal(decision.matchedBy, "strong_rule");
});

test("intent router uses conservative read-only fallback", () => {
  const decision = new IntentRouter().route("帮我处理一下", ["memory_write", "retrieval", "search"]);
  assert.deepEqual([...decision.categories].sort(), ["retrieval", "search"]);
  assert.equal(decision.matchedBy, "fallback");
});

test("intent router canonicalizes category aliases", () => {
  const decision = new IntentRouter().route("查看以前记录的笔记", ["memory"]);
  assert.deepEqual([...decision.categories], ["memory_read"]);
});

test("context pipeline only loads builders selected by the route", async () => {
  const calls = [];
  const builder = (name) => ({
    async injectMemory(request) { calls.push(name); return request.messages; },
    async injectRag(request) { calls.push(name); return request.messages; },
    async injectWebSearch(request) { calls.push(name); return request.messages; },
    async injectWebFetch(request) { calls.push(name); return request.messages; }
  });
  const pipeline = new AgentContextPipeline(
    builder("memory"),
    builder("fetch"),
    builder("search")
  );
  await pipeline.build(
    { messages: [{ role: "user", content: "请根据知识库文档回答" }] },
    new IntentRouter().route("请根据知识库文档回答", ["retrieval", "search", "memory_read"])
  );
  assert.deepEqual(calls, ["fetch"]);
});

test("intent route decision exposes reason in event payload", () => {
  const decision = new IntentRouteDecision(new Set(["retrieval"]), "llm", 0.91, "", { retrieval: 4 }, ["rag_search"], "llm_reason");
  const payload = decision.toEventPayload();
  assert.equal(payload.reason, "llm_reason");
  assert.equal(payload.matched_by, "llm");
});
