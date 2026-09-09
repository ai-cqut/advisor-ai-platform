import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import { ProviderModelCatalog } from "../../../provider/model/ProviderModelCatalog.js";
import { validateChatStreamRequest } from "../../../common/request/validation/stream/validateChatStreamRequest.js";
import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import type { AgentCoreClient } from "../../../core/client/AgentCoreClient.js";
import type { MemoryContextBuilder } from "../../../memory/context/core/MemoryContextBuilder.js";
import type { MemoryTaskSubmitter } from "../../../memory/task/submitter/MemoryTaskSubmitter.js";
import type { OpenAIChatClient } from "../../../openai/chat/core/client/OpenAIChatClient.js";
import type { OpenAiToolRegistry } from "../../../openai/tools/registry/core/registry/OpenAiToolRegistry.js";
import { SseWriterFactory } from "../../../protocol/sse/factory/SseWriterFactory.js";
import type { WebFetchContextBuilder } from "../../../web/context/fetch/core/WebFetchContextBuilder.js";
import type { WebSearchContextBuilder } from "../../../web/context/search/core/WebSearchContextBuilder.js";
import type { SkillRegistry } from "../../../skills/core/SkillRegistry.js";
import { AgentGraphHealthDescriptor } from "../../health/core/AgentGraphHealthDescriptor.js";
import { AgentRequestIdResolver } from "../../request/core/AgentRequestIdResolver.js";
import { AgentRuntimeComponents } from "../model/components/AgentRuntimeComponents.js";

export class AgentRuntime {
  private readonly components: AgentRuntimeComponents;
  private readonly graphHealthDescriptor = new AgentGraphHealthDescriptor();
  private readonly requestIdResolver = new AgentRequestIdResolver();
  private readonly sseWriterFactory = new SseWriterFactory();
  private readonly modelCatalog = new ProviderModelCatalog();
  private readonly memoryEnabled: boolean;

  constructor(
    config: AgentConfig,
    private readonly core: AgentCoreClient,
    private readonly openAiClient: OpenAIChatClient,
    memoryContextBuilder?: MemoryContextBuilder,
    memoryTaskSubmitter?: MemoryTaskSubmitter,
    webFetchContextBuilder?: WebFetchContextBuilder,
    webSearchContextBuilder?: WebSearchContextBuilder,
    openAiToolRegistry?: OpenAiToolRegistry,
    skillRegistry?: SkillRegistry
  ) {
    this.memoryEnabled = Boolean(memoryContextBuilder || memoryTaskSubmitter);
    for (const model of config.openAiModels) {
      this.modelCatalog.register({
        provider: "openai",
        model,
        contextWindowTokens: config.contextWindowTokens,
        supportsTools: true,
        supportsReasoning: model.startsWith("o")
      });
    }
    this.components = new AgentRuntimeComponents(
      config,
      this.core,
      this.openAiClient,
      memoryContextBuilder,
      memoryTaskSubmitter,
      webFetchContextBuilder,
      webSearchContextBuilder,
      openAiToolRegistry,
      skillRegistry
    );
  }

  async coreHealth(): Promise<JsonObject> {
    return this.core.health();
  }

  async graphHealth(): Promise<JsonObject> {
    return this.graphHealthDescriptor.describe({
      memoryEnabled: this.components.streamSession.getMemoryEnabled() || this.memoryEnabled,
      contextCompaction: this.components.streamSession.getContextCompactionSnapshot(),
      graph: this.components.streamSession.getGraphHealthSnapshot()
    });
  }

  models(): JsonObject {
    return {
      object: "list",
      data: this.modelCatalog.list("openai").map((capability) => ({
        id: capability.model,
        object: "model",
        owned_by: capability.provider,
        context_window: capability.contextWindowTokens,
        supports_tools: capability.supportsTools,
        supports_reasoning: capability.supportsReasoning
      }))
    };
  }

  async summarizeTitle(question: string): Promise<string> {
    const response = await this.openAiClient.chatWithStructuredOutput(
      [
        {
          role: "system",
          content:
            "你是对话标题总结子代理。只根据用户问题生成简短中文标题。" +
            "不要回答问题，不要调用工具，不要检索知识库，不要联网。" +
            "标题最多 12 个汉字，只返回 JSON。"
        },
        { role: "user", content: question.trim() }
      ],
      {
        name: "chat_title",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { title: { type: "string" } },
          required: ["title"]
        }
      }
    );
    const parsed = JSON.parse(response) as { title?: unknown };
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    if (!title) throw new Error("title generation returned an empty title");
    return title.slice(0, 12);
  }

  async streamChat(body: unknown, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chatRequest = validateChatStreamRequest(body);
    const traceId = this.requestIdResolver.resolveTraceId(chatRequest, request);
    const turnId = this.requestIdResolver.resolveTurnId(chatRequest, request);
    const writer = this.sseWriterFactory.create(response, this.core, traceId);
    await this.components.streamSession.stream(chatRequest, turnId, writer);
  }
}
