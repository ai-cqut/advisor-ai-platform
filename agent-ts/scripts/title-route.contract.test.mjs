import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { AgentHttpRequestReader } from "../dist/http/request/reader/AgentHttpRequestReader.js";
import { AgentTitleRouteHandler } from "../dist/http/routes/chat/AgentTitleRouteHandler.js";

function requestWithJson(body) {
  const request = new EventEmitter();
  queueMicrotask(() => {
    request.emit("data", Buffer.from(JSON.stringify(body)));
    request.emit("end");
  });
  return request;
}

test("title route summarizes a question without using the chat stream", async () => {
  const calls = [];
  const handler = new AgentTitleRouteHandler(
    {
      summarizeTitle: async (question) => {
        calls.push(question);
        return "修改密码方法";
      }
    },
    new AgentHttpRequestReader()
  );

  const result = await handler.handle(
    "POST",
    new URL("http://localhost/chat/title"),
    requestWithJson({ question: "如何修改密码？" }),
    {}
  );

  assert.deepEqual(calls, ["如何修改密码？"]);
  assert.deepEqual(result, { statusCode: 200, body: { title: "修改密码方法" } });
});

test("title route ignores non-POST requests", async () => {
  const handler = new AgentTitleRouteHandler(
    { summarizeTitle: async () => "不应被调用" },
    new AgentHttpRequestReader()
  );

  const result = await handler.handle(
    "GET",
    new URL("http://localhost/chat/title"),
    requestWithJson({ question: "不会读取" }),
    {}
  );

  assert.equal(result, null);
});
