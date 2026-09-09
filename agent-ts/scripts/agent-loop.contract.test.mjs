import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentLoop } from "../dist/app/loop/core/AgentLoop.js";
import { RegexSafetyFilter } from "../dist/safety/regex/RegexSafetyFilter.js";
import { StreamingRegexSafetyFilter } from "../dist/safety/streaming/StreamingRegexSafetyFilter.js";
import { ContextCompactionService } from "../dist/context/compaction/core/ContextCompactionService.js";

const request = { messages: [{ role: "user", content: "run tools" }] };

async function* streamWithToolCalls() {
  yield { type: "tool_call", toolCallId: "call-1", toolName: "slow_a", toolArgs: {} };
  yield { type: "tool_call", toolCallId: "call-2", toolName: "slow_b", toolArgs: {} };
}

async function* streamWithoutTools() {
  yield { type: "delta", text: "done" };
}

async function* streamWithoutContent() {}

test("tool results are executed concurrently and written back in call order", async () => {
  let started = 0;
  let release;
  const bothStarted = new Promise((resolve) => { release = resolve; });
  const executionOrder = [];
  const writeOrder = [];
  const lifecycle = [];
  const loop = new AgentLoop({
    chatRequest: request,
    maxTurns: 1,
    stream: streamWithToolCalls,
    executeTool: async (_request, toolName) => {
      started += 1;
      if (started === 2) release();
      await bothStarted;
      executionOrder.push(toolName);
      return { output: toolName, success: true };
    },
    writer: async (event) => {
      if (event.type === "tool_result") {
        writeOrder.push(event.toolName);
        assert.deepEqual(event.toolArgs, {});
      }
    },
    onEvent: async (event) => lifecycle.push(event)
  });

  await loop.run();
  assert.deepEqual(executionOrder.sort(), ["slow_a", "slow_b"]);
  assert.deepEqual(writeOrder, ["slow_a", "slow_b"]);
  assert.deepEqual(
    lifecycle.map((event) => event.type),
    [
      "agent_start",
      "turn_start",
      "provider_request_start",
      "provider_request_end",
      "tool_execution_start",
      "tool_execution_start",
      "tool_execution_end",
      "tool_execution_end",
      "turn_end",
      "agent_end"
    ]
  );
});

test("declared tool timeout returns structured TOOL_TIMEOUT", async () => {
  const loop = new AgentLoop({
    chatRequest: request,
    maxTurns: 1,
    stream: streamWithToolCalls,
    toolTimeoutMs: () => 5,
    executeTool: async () => new Promise((resolve) => {
      setTimeout(() => resolve({ output: "late", success: true }), 30);
    }),
    writer: async (event) => {
      if (event.type === "tool_result") {
        assert.deepEqual(event.toolArgs, {});
        results.push(JSON.parse(event.toolOutput));
      }
    },
  });

  const results = [];
  await loop.run();
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.code === "TOOL_TIMEOUT"));
});

test("tool execution retries until success and records final attempt", async () => {
  const attemptsByTool = { slow_a: 0, slow_b: 0 };
  const toolResults = [];
  const loop = new AgentLoop({
    chatRequest: request,
    maxTurns: 1,
    stream: streamWithToolCalls,
    executeTool: async (_request, toolName) => {
      attemptsByTool[toolName] += 1;
      if (attemptsByTool[toolName] < 3) {
        return { output: JSON.stringify({ ok: false, status: "error", message: "retry", items: [] }), success: false };
      }
      return { output: JSON.stringify({ ok: true, status: "hit", items: [] }), success: true };
    },
    writer: async (event) => {
      if (event.type === "tool_result") {
        toolResults.push(event);
      }
    }
  });

  await loop.run();
  assert.equal(toolResults.length, 2);
  assert.equal(toolResults[0].attempt, 3);
  assert.equal(toolResults[1].attempt, 3);
  assert.equal(toolResults[0].success, true);
  assert.equal(toolResults[1].success, true);
  assert.equal(attemptsByTool.slow_a, 3);
  assert.equal(attemptsByTool.slow_b, 3);
});

test("planned tool steps execute before generation and emit completed tool events", async () => {
  const events = [];
  const calls = [];
  const loop = new AgentLoop({
    chatRequest: request,
    maxTurns: 1,
    toolPlan: {
      mode: "plan_and_execute",
      steps: [{ action: "call_tool", tool_name: "rag_search", arguments: { query: "辅导员能力" } }]
    },
    stream: streamWithoutTools,
    executeTool: async (_request, toolName, args) => {
      calls.push({ toolName, args });
      return {
        output: JSON.stringify({
          ok: true,
          status: "hit",
          derived: { sources: [{ id: 1, docName: "policy.pdf", snippet: "证据" }] }
        }),
        success: true
      };
    },
    writer: async (event) => events.push(event)
  });

  await loop.run();
  assert.deepEqual(calls, [{ toolName: "rag_search", args: { query: "辅导员能力" } }]);
  assert.deepEqual(events.map((event) => event.type), ["tool_call", "tool_result", "delta"]);
  assert.equal(events[1].success, true);
});

test("safety filters redact PII and secrets across stream chunk boundaries", () => {
  const filter = new RegexSafetyFilter();
  assert.equal(filter.redact("联系 13812345678 或 test@example.com"), "联系 [MASK:PHONE] 或 [MASK:EMAIL]");
  assert.equal(filter.redact("token=sk-test12345678901234567890"), "[MASK:SECRET]");

  const streaming = new StreamingRegexSafetyFilter(filter);
  const output = streaming.processChunk("token=sk-") + streaming.processChunk("test12345678901234567890") + streaming.flush();
  assert.equal(output, "[MASK:SECRET]");
});

test("context compaction preserves system and recent messages with token statistics", () => {
  const compactor = new ContextCompactionService(20, 4, 2);
  const result = compactor.compact([
    { role: "system", content: "rules" },
    { role: "user", content: "old question one with enough text" },
    { role: "assistant", content: "old answer one with enough text" },
    { role: "user", content: "latest question" },
    { role: "assistant", content: "latest answer" }
  ]);
  assert.equal(result.compacted, true);
  assert.equal(result.droppedMessages, 2);
  assert.equal(result.messages[0].role, "system");
  assert.match(result.messages[1].content, /历史上下文已压缩/);
  assert.equal(result.messages.at(-1)?.content, "latest answer");
  assert.ok(result.tokensReleased > 0);
});

test("context compaction persists transcript and exposes python-like stats", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "advisor-ai-ts-compaction-"));
  const originalCwd = process.cwd();
  process.chdir(baseDir);
  try {
    const compactor = new ContextCompactionService(20, 4, 2);
    const result = compactor.compact([
      { role: "user", content: "old question with enough text" },
      { role: "assistant", content: "old answer with enough text" },
      { role: "user", content: "latest question" }
    ]);

    assert.equal(result.autoCompacted, true);
    assert.equal(result.transcriptPath.includes("session_unknown_"), true);
    assert.equal(result.latencyMs >= 0, true);
    const transcript = readFileSync(result.transcriptPath, "utf8").trim().split("\n");
    assert.equal(transcript.length, 3);
    assert.equal(JSON.parse(transcript[0]).content, "old question with enough text");
  } finally {
    process.chdir(originalCwd);
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test("direct generation rejects empty stream without content", async () => {
  const loop = new AgentLoop({
    chatRequest: request,
    maxTurns: 1,
    stream: streamWithoutContent,
    forceDirectGeneration: true,
    executeTool: async () => ({ output: "", success: true })
  });

  await assert.rejects(() => loop.run(), /stream finished without content/);
});
