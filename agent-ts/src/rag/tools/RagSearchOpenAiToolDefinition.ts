import type { OpenAIChatTool } from "../../openai/chat/model/tool/OpenAIChatTool.js";

export class RagSearchOpenAiToolDefinition {
  create(): OpenAIChatTool {
    return {
      type: "function",
      function: {
        name: "rag_search",
        description: "按用户问题检索知识库原文片段，用于基于资料内容回答。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "检索关键词或用户问题" },
            top_k: { type: "integer", description: "返回文档数量，默认 5，最大 10" }
          }
        }
      },
      meta: {
        category: "retrieval",
        readOnly: true,
        searchHint: "知识库,文档,资料,政策,制度,辅导员"
      }
    };
  }
}
