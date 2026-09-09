import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import type { ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import type { AgentCoreClient } from "../../../core/client/AgentCoreClient.js";
import type { OpenAIChatClient } from "../../../openai/chat/core/client/OpenAIChatClient.js";
import type { AgentOpenAiToolFacade } from "../../openAi/core/AgentOpenAiToolFacade.js";
import type { AgentContextPipeline } from "../../session/core/pipeline/AgentContextPipeline.js";
import { AgentLoop } from "../core/AgentLoop.js";
import type { AgentLoopOptions } from "../model/AgentLoopOptions.js";
import { ProviderError } from "../../../provider/model/ProviderError.js";
import { isProviderErrorCode } from "../../../provider/model/ProviderErrorCode.js";
import { TaskPlanner } from "../../../planning/core/TaskPlanner.js";
import { buildPlannedToolContext, plannedToolSteps } from "../../../planning/core/PlannedTools.js";

export class AgentLoopFactory {
  private readonly taskPlanner: TaskPlanner;

  constructor(
    private readonly config: AgentConfig,
    private readonly core: AgentCoreClient,
    private readonly openAiClient: OpenAIChatClient,
    private readonly openAiToolFacade: AgentOpenAiToolFacade,
    private readonly contextPipeline: AgentContextPipeline
  ) {
    this.taskPlanner = new TaskPlanner(config, openAiClient);
  }

  create(chatRequest: ChatStreamRequest, options?: Partial<AgentLoopOptions>): AgentLoop {
    const factory = this;
    const streamFn: AgentLoopOptions["stream"] = async function* (messages, signal) {
      const tools = factory.taskPlanner.prioritizeTools(
        await factory.openAiToolFacade.listTools(),
        options?.toolPlan
      );
      if (factory.core.canStream()) {
        let streamStarted = false;
        try {
          const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
          for await (const event of factory.core.streamChat(
            {
              url: `${factory.config.openAiBaseUrl}/chat/completions`,
              apiKey: factory.config.openAiApiKey,
              model: factory.config.openAiModel,
              temperature: factory.config.openAiTemperature,
              requestTimeoutMs: factory.config.requestTimeoutMs,
              messages,
              tools
            },
            signal
          )) {
            if (event.type === "text_delta" || event.type === "delta") {
              streamStarted = streamStarted || event.text.length > 0;
              yield { type: "delta", text: event.text } as const;
            } else if (event.type === "tool_call_delta") {
              streamStarted = true;
              const current = toolCalls.get(event.index) || { id: "", name: "", arguments: "" };
              current.id += event.id || "";
              current.name += event.name || "";
              current.arguments += event.arguments_delta;
              toolCalls.set(event.index, current);
            } else if (event.type === "finish") {
              for (const [, toolCall] of [...toolCalls.entries()].sort(([left], [right]) => left - right)) {
                let toolArgs: JsonObject = {};
                if (toolCall.arguments.trim()) {
                  toolArgs = JSON.parse(toolCall.arguments) as JsonObject;
                }
                yield {
                  type: "tool_call",
                  toolCallId: toolCall.id,
                  toolName: toolCall.name,
                  toolArgs
                } as const;
              }
            } else if (event.type === "error") {
              if (!isProviderErrorCode(event.code)) {
                throw new Error(`unknown provider error code: ${event.code}`);
              }
              throw new ProviderError(event.code, event.message, { retryable: event.retryable });
            } else if (event.type === "tool_call") {
              yield {
                type: "tool_call",
                toolCallId: event.tool_call_id,
                toolName: event.tool_name,
                toolArgs: event.tool_args
              } as const;
            }
          }
          // Rust streaming succeeded: do not fall through to the TypeScript path.
          return;
        } catch (error) {
          const canFallback = !streamStarted &&
            (!(error instanceof ProviderError) || error.retryable);
          if (!canFallback) throw error;
          // Fall back only before visible output and only for retryable provider failures.
        }
      }
      for await (const event of factory.openAiClient.streamChatEvents(messages, tools, undefined, signal)) {
        yield event;
      }
    };
    const executeTool = (
      currentChatRequest: ChatStreamRequest,
      toolName: string,
      args: JsonObject,
      signal?: AbortSignal
    ) => factory.openAiToolFacade.executeTool(currentChatRequest, toolName, args, signal);
    const transformContext = async (messages: ChatStreamRequest["messages"], signal?: AbortSignal) =>
      factory.contextPipeline.transform(messages, signal);
    const plannedSteps = plannedToolSteps(options?.toolPlan);
    const forceDirectGeneration = Boolean(options?.forceDirectGeneration);
    const mergedTransformContext = async (messages: ChatStreamRequest["messages"], signal?: AbortSignal) => {
      const transformed = await transformContext(messages, signal);
      if (plannedSteps.length === 0) {
        return transformed;
      }
      const plannedObservations = await Promise.all(
        plannedSteps.map(async (step, index) => ({
          tool_name: step.toolName,
          status: "planned",
          message: step.reason || "planned tool step",
          items: [
            {
              type: "text",
              text: `planned step #${index + 1}: ${step.toolName}`
            }
          ]
        }))
      );
      return [
        {
          role: "system",
          content: buildPlannedToolContext(plannedObservations)
        },
        ...transformed
      ];
    };
    return new AgentLoop({
      stream: streamFn,
      executeTool,
      chatRequest,
      transformContext: mergedTransformContext,
      maxTurns: 3,
      forceDirectGeneration,
      ...options
    });
  }
}
