import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { test } from "node:test";
import { AgentCoreClient } from "../dist/core/client/AgentCoreClient.js";
import { AgentChatStreamSession } from "../dist/app/session/core/stream/AgentChatStreamSession.js";
import { OpenAIChatClient } from "../dist/openai/chat/core/client/OpenAIChatClient.js";

test("AgentCoreClient falls back to the serializer when streaming is disabled", async () => {
  const client = new AgentCoreClient(undefined, false);
  const serialized = await client.serializeEvent({
    event: "sys_done",
    source: "system",
    traceId: "trace-1",
    payload: { finish_reason: "stream_finished" }
  });
  assert.match(serialized, /sys_done/);
});

test("Agent stream error resolver returns the python-shaped fixed message", async () => {
  const { AgentStreamErrorMessageResolver } = await import("../dist/app/session/support/error/AgentStreamErrorMessageResolver.js");
  const resolver = new AgentStreamErrorMessageResolver();
  assert.equal(resolver.resolve(new Error("boom")), "服务内部错误，请稍后重试");
  assert.equal(resolver.resolve("boom"), "服务内部错误，请稍后重试");
});

test("AgentChatStreamSession executes Rust tool calls and sends a second round", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      if (body.includes('"role":"tool"')) {
        response.end(
          'data: {"choices":[{"delta":{"content":"tool-result-used"}}]}\n\n' +
            'data: {"choices":[{"finish_reason":"stop"}]}\n\n' +
            "data: [DONE]\n\n"
        );
        return;
      }
      response.end(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_","function":{"name":"search","arguments":"{\\"q\\":\\"hel"}}]}}]}\n\n' +
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"1","function":{"arguments":"lo\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n' +
          "data: [DONE]\n\n"
      );
    });
  });
  await listen(server);

  try {
    const address = server.address();
    assert.notEqual(typeof address, "string");
    assert.ok(address);
    const writes = [];
    const config = {
      openAiApiKey: "integration-key",
      openAiBaseUrl: "http://127.0.0.1:" + address.port,
      openAiModel: "integration-model",
      openAiTemperature: 0.2,
      requestTimeoutMs: 1_000
    };
    const tool = {
      type: "function",
      function: { name: "search", description: "search", parameters: { type: "object" } }
    };
    const session = new AgentChatStreamSession(
      config.openAiApiKey,
      config,
      { canStream() { return false; } },
      { async build() { return [{ role: "user", content: "hello" }]; }, async transform(messages) { return messages; } },
      { async submit() {} },
      {
        async *streamChatEvents() {
          yield { type: "delta", text: "tool-result-used" };
        }
      },
      { async listTools() { return [tool]; }, async executeTool() { return { output: "search-result", success: true }; } }
    );
    const writer = {
      async start() {},
      async write(event, source, payload) { writes.push({ event, source, payload }); },
      async done(reason) { writes.push({ event: "done", reason }); },
      async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
    };

    await session.stream({ messages: [{ role: "user", content: "hello" }] }, "turn-1", writer);

    assert.deepEqual(writes.map(({ event }) => event), ["sys_intent_route", "llm_delta", "done"]);
    assert.equal(writes[1].payload.text, "tool-result-used");
  } finally {
    server.close();
  }
});

test("AgentChatStreamSession force fetches web urls before the model round", async () => {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      if (body.includes('"role":"tool"')) {
        response.end(
          'data: {"choices":[{"delta":{"content":"forced-fetch-answer"}}]}\n\n' +
            'data: {"choices":[{"finish_reason":"stop"}]}\n\n' +
            "data: [DONE]\n\n"
        );
        return;
      }
      response.end(
        'data: {"choices":[{"delta":{"content":"unused"}}]}\n\n' +
          'data: {"choices":[{"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n"
      );
    });
  });
  await listen(server);

  try {
    const address = server.address();
    assert.notEqual(typeof address, "string");
    assert.ok(address);
    const writes = [];
    const config = {
      openAiApiKey: "integration-key",
      openAiBaseUrl: "http://127.0.0.1:" + address.port,
      openAiModel: "integration-model",
      openAiTemperature: 0.2,
      requestTimeoutMs: 1_000
    };
    const fetchTool = {
      type: "function",
      function: { name: "web_fetch", description: "web_fetch", parameters: { type: "object" } }
    };
    const session = new AgentChatStreamSession(
      config.openAiApiKey,
      config,
      { canStream() { return false; } },
      { async build() { return [{ role: "user", content: "https://example.com 读取这个网页" }]; }, async transform(messages) { return messages; } },
      { async submit() {} },
      {
        async *streamChatEvents() {
          yield { type: "delta", text: "forced-fetch-answer" };
        }
      },
      {
        async listTools() { return [fetchTool]; },
        async executeTool(_chatRequest, toolName, args) {
          assert.equal(toolName, "web_fetch");
          assert.equal(args.url, "https://example.com");
          return {
            output: JSON.stringify({
              ok: true,
              status: "hit",
              items: [{ content: "forced fetch content" }]
            }),
            success: true
          };
        }
      }
    );
    const writer = {
      async start() {},
      async write(event, source, payload) { writes.push({ event, source, payload }); },
      async done(reason) { writes.push({ event: "done", reason }); },
      async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
    };

    await session.stream({ messages: [{ role: "user", content: "https://example.com 读取这个网页" }] }, "turn-1", writer);

    assert.equal(writes.some(({ event }) => event === "sys_intent_route"), true);
    assert.equal(writes.some(({ event }) => event === "llm_delta"), true);
    assert.equal(writes.some(({ event }) => event === "done"), true);
  } finally {
    server.close();
  }
});

test("AgentChatStreamSession downgrades strong search routing without matched tools", async () => {
  const writes = [];
  const config = {
    openAiApiKey: "integration-key",
    openAiBaseUrl: "http://127.0.0.1:65535",
    openAiModel: "integration-model",
    openAiTemperature: 0.2,
    requestTimeoutMs: 1_000
  };
  const session = new AgentChatStreamSession(
    config.openAiApiKey,
    config,
    { canStream() { return false; } },
    { async build() { return [{ role: "user", content: "https://example.com 看一下这个页面" }]; }, async transform(messages) { return messages; } },
    { async submit() {} },
    {
      async *streamChatEvents() {
        yield { type: "delta", text: "ok" };
      }
    },
    {
      async listTools() { return [{ type: "function", function: { name: "web_fetch", description: "web_fetch", parameters: {} } }]; },
      async executeTool() { return { output: JSON.stringify({ ok: true, status: "hit", items: [] }), success: true }; }
    }
  );
  const writer = {
    async start() {},
    async write(event, source, payload) { writes.push({ event, source, payload }); },
    async done(reason) { writes.push({ event: "done", reason }); },
    async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
  };

  await session.stream({ messages: [{ role: "user", content: "https://example.com 看一下这个页面" }] }, "turn-1", writer);

  const intentRoute = writes.find(({ event }) => event === "sys_intent_route");
  assert.ok(intentRoute);
  assert.equal(intentRoute.payload.matched_by, "fallback");
});

test("AgentChatStreamSession emits legacy reasoning for education queries", async () => {
  const writes = [];
  const plans = [];
  const config = {
    openAiApiKey: "integration-key",
    openAiBaseUrl: "http://127.0.0.1:65535",
    openAiModel: "integration-model",
    openAiTemperature: 0.2,
    requestTimeoutMs: 1_000
  };
  const session = new AgentChatStreamSession(
    config.openAiApiKey,
    config,
    { canStream() { return false; } },
    { async build() { return [{ role: "user", content: "请根据知识库文档解释学生工作政策" }]; }, async transform(messages) { return messages; } },
    { async submit() {} },
    {
      async *streamChatEvents() {
        yield { type: "delta", text: "ok" };
      }
    },
    {
      async listTools() { return [{ type: "function", function: { name: "rag_search", description: "rag_search", parameters: {} } }]; },
      async executeTool() { return { output: JSON.stringify({ ok: true, status: "hit", items: [] }), success: true }; }
    }
  );
  const writer = {
    async start() {},
    async write(event, source, payload) { writes.push({ event, source, payload }); },
    async done(reason) { writes.push({ event: "done", reason }); },
    async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
  };

  await session.stream({ messages: [{ role: "user", content: "请根据知识库文档解释学生工作政策" }] }, "turn-1", writer);

  const sysToolPlan = writes.find(({ event }) => event === "sys_tool_plan");
  assert.equal(writes.some(({ event }) => event === "sys_reasoning"), true);
  assert.equal(writes.some(({ event }) => event === "sys_tool_plan"), true);
  assert.equal(sysToolPlan.payload.route_context.education_domain, true);
  assert.equal(writes[writes.length - 1].event, "done");
});

test("SseWriter start emits sys_start payload", async () => {
  const writes = [];
  const writer = {
    signal: undefined,
    start: async () => {},
    write: async (event, source, payload) => {
      writes.push({ event, source, payload });
    },
    done: async () => {},
    error: async () => {}
  };
  const session = new AgentChatStreamSession(
    "integration-key",
    {
      openAiApiKey: "integration-key",
      openAiBaseUrl: "http://127.0.0.1:65535",
      openAiModel: "integration-model",
      openAiTemperature: 0.2,
      requestTimeoutMs: 1_000,
      contextWindowTokens: 2048,
      contextReserveTokens: 256,
      contextKeepLastMessages: 6,
      failureMemoryPath: ".agent-data/failure-memory.jsonl",
      failureMemoryScoreThreshold: 70
    },
    { canStream() { return false; } },
    { async build() { return [{ role: "user", content: "hello" }]; }, async transform(messages) { return messages; } },
    { async submit() {} },
    {
      async *streamChatEvents() {
        yield { type: "delta", text: "ok" };
      }
    },
    { async listTools() { return []; }, async executeTool() { return { output: "", success: true }; } }
  );

  await session.stream({ messages: [{ role: "user", content: "hello" }] }, "turn-1", writer);
  const startEvent = writes.find((item) => item.event === "sys_start" || item.event === "sys_intent_route");
  assert.ok(startEvent);
  if (startEvent.event === "sys_start") {
    assert.equal(startEvent.payload.message, "stream_started");
    assert.equal("runtime" in startEvent.payload, false);
  } else {
    assert.equal(startEvent.payload.matched_by, "fallback");
  }
});

test("AgentChatStreamSession aborts a running TS fallback stream", async () => {
  let requestAborted = false;
  const controller = new AbortController();
  let resolveResponseClosed;
  const responseClosed = new Promise(resolve => {
    resolveResponseClosed = resolve;
  });
  const server = createServer((request, response) => {
    request.resume();
    request.on("aborted", () => {
      requestAborted = true;
    });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.on("close", () => {
      requestAborted = true;
      resolveResponseClosed();
    });
    setTimeout(() => controller.abort(), 50);
  });
  await listen(server);

  try {
    const address = server.address();
    assert.notEqual(typeof address, "string");
    assert.ok(address);
    const config = {
      openAiApiKey: "integration-key",
      openAiBaseUrl: "http://127.0.0.1:" + address.port,
      openAiModel: "integration-model",
      openAiTemperature: 0.2,
      requestTimeoutMs: 10_000
    };
    const writes = [];
    const session = new AgentChatStreamSession(
      config.openAiApiKey,
      config,
      { canStream() { return false; } },
      { async build() { return [{ role: "user", content: "hello" }]; }, async transform(messages) { return messages; } },
      { async submit() {} },
      new OpenAIChatClient(config),
      { async listTools() { return []; }, async executeTool() { return { output: "unused", success: true }; } }
    );
    const writer = {
      signal: controller.signal,
      async start() {},
      async write(event, source, payload) { writes.push({ event, source, payload }); },
      async done(reason) { writes.push({ event: "done", reason }); },
      async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
    };

    await session.stream({ messages: [{ role: "user", content: "hello" }] }, "turn-1", writer);
    await responseClosed;

    assert.equal(requestAborted, true);
    assert.equal(writes[0].event, "sys_intent_route");
  } finally {
    server.close();
  }
});

test("AgentChatStreamSession stops before the final model round when a tool aborts", async () => {
  const requests = [];
  const controller = new AbortController();
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      requests.push(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{}"}}]}}]}' +
          "\n\n" +
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
          "data: [DONE]\n\n"
      );
    });
  });
  await listen(server);

  try {
    const address = server.address();
    assert.notEqual(typeof address, "string");
    assert.ok(address);
    const config = {
      openAiApiKey: "integration-key",
      openAiBaseUrl: "http://127.0.0.1:" + address.port,
      openAiModel: "integration-model",
      openAiTemperature: 0.2,
      requestTimeoutMs: 1_000
    };
    const writes = [];
    const tool = { type: "function", function: { name: "search", description: "search", parameters: {} } };
    const session = new AgentChatStreamSession(
      config.openAiApiKey,
      config,
      { canStream() { return false; } },
      { async build() { return [{ role: "user", content: "hello" }]; }, async transform(messages) { return messages; } },
      { async submit() {} },
      new OpenAIChatClient(config),
      { async listTools() { return [tool]; }, async executeTool() { setTimeout(() => controller.abort(), 10); await new Promise(resolve => setTimeout(resolve, 30)); return { output: "unused", success: true }; } }
    );
    const writer = {
      signal: controller.signal,
      async start() {},
      async write(event, source, payload) { writes.push({ event, source, payload }); },
      async done(reason) { writes.push({ event: "done", reason }); },
      async error(code, message, retryable) { throw new Error(code + ": " + message + ": " + retryable); }
    };

    await session.stream({ messages: [{ role: "user", content: "hello" }] }, "turn-1", writer);

    assert.equal(requests.length, 2);
    assert.equal(writes.some(({ event }) => event === "done"), false);
  } finally {
    server.close();
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}
