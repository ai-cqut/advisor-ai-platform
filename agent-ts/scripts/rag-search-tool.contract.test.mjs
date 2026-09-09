import assert from "node:assert/strict";
import test from "node:test";
import { RagSearchToolResultFactory } from "../dist/rag/openAi/result/RagSearchToolResultFactory.js";
import { RagOpenAiToolExecutor } from "../dist/rag/openAi/execution/RagOpenAiToolExecutor.js";

test("rag search tool result includes real chunk content", () => {
  const result = new RagSearchToolResultFactory().create([
    {
      documentId: 1,
      fileName: "policy.pdf",
      chunkIndex: 3,
      content: "辅导员应具备思想理论教育能力。",
      score: 0.87
    }
  ]);

  const payload = JSON.parse(result.output);
  assert.equal(payload.status, "hit");
  assert.equal(payload.items[0].docName, "policy.pdf");
  assert.equal(payload.items[0].snippet, "辅导员应具备思想理论教育能力。");
  assert.equal(payload.items[0].content, "辅导员应具备思想理论教育能力。");
  assert.equal(payload.items[0].score, 0.87);
});

test("rag executor searches chunks through rag api client", async () => {
  const calls = [];
  const executor = new RagOpenAiToolExecutor({
    searchDocuments: async (query, topK) => {
      calls.push({ query, topK });
      return [
        {
          documentId: 1,
          fileName: "policy.pdf",
          chunkIndex: 3,
          content: "命中原文",
          score: 0.91
        }
      ];
    }
  });

  const result = await executor.execute(
    { messages: [{ role: "user", content: "默认问题" }] },
    { query: "检索问题", top_k: 2 }
  );

  assert.deepEqual(calls, [{ query: "检索问题", topK: 2 }]);
  assert.equal(JSON.parse(result.output).items[0].content, "命中原文");
});
