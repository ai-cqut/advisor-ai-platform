import type { ChatStreamRequest } from "../../../../common/model/ChatStreamRequest.js";
import type { AgentConfig } from "../../../../config/model/core/AgentConfig.js";
import type { AgentCoreClient } from "../../../../core/client/AgentCoreClient.js";
import type { OpenAIChatClient } from "../../../../openai/chat/core/client/OpenAIChatClient.js";
import { AgentStreamEventWriter } from "../../../../protocol/events/stream/writer/AgentStreamEventWriter.js";
import type { SseWriter } from "../../../../protocol/sse/writer/SseWriter.js";
import { AgentLoopFactory } from "../../../loop/factory/AgentLoopFactory.js";
import type { AgentMemoryTaskCompletionSubmitter } from "../../../memory/execution/AgentMemoryTaskCompletionSubmitter.js";
import type { AgentOpenAiToolFacade } from "../../../openAi/core/AgentOpenAiToolFacade.js";
import type { AgentContextPipeline } from "../pipeline/AgentContextPipeline.js";
import type { SkillRegistry } from "../../../../skills/core/SkillRegistry.js";
import { AgentMissingOpenAiApiKeyFallbackGate } from "../../support/fallback/AgentMissingOpenAiApiKeyFallbackGate.js";
import { AgentStreamErrorMessageResolver } from "../../support/error/AgentStreamErrorMessageResolver.js";
import { InputSafetySanitizer } from "../../../../safety/input/InputSafetySanitizer.js";
import { ContextCompactionService } from "../../../../context/compaction/core/ContextCompactionService.js";
import { LatestUserQueryResolver } from "../../../../common/request/resolver/LatestUserQueryResolver.js";
import { IntentRouter } from "../../../../routing/core/IntentRouter.js";
import { TaskPlanner } from "../../../../planning/core/TaskPlanner.js";
import { ToolExplorer } from "../../../../tools/explorer/core/ToolExplorer.js";
import { PromptBuilder } from "../../../../prompt/PromptBuilder.js";
import { FailureMemoryStore } from "../../../../memory/failure/core/FailureMemoryStore.js";
import { FailureMemorySupport } from "../../../../memory/failure/core/FailureMemorySupport.js";
import { FailureMemoryTraceRecorder } from "../../../../memory/failure/core/FailureMemoryTraceRecorder.js";
import type { JsonObject } from "../../../../common/json/types/JsonTypes.js";
import {
  adjustRoutePayload,
  buildLegacyRouteContext,
  buildPlannerRouteContext,
  preferRetrievalFallback
} from "../../../../legacy/core/LegacyRouteSupport.js";
import {
  buildDelegateReasoningPayload,
  buildPlanReasoningPayload,
  buildRouteReasoningPayload,
  shouldEmitPlanningReasoning
} from "../../../../legacy/core/LegacyReasoning.js";
import { executeLegacyForceFetch, resolveForceFetchUrl } from "../../../../legacy/core/LegacyForceFetch.js";
import { LegacyMessagePreparer } from "../../../../legacy/core/LegacyMessagePreparer.js";
import { preferRagOnly, shouldForceEducationRag } from "../../../../graph/helpers.js";
import { buildExplorerContext } from "../../../../graph/helpers.js";
import { AgentGraphRunner } from "../../../../graph/core/AgentGraphRunner.js";
import type { GraphState, GraphExplorationState } from "../../../../graph/model/GraphState.js";
import type { AgentLoopOptions } from "../../../loop/model/AgentLoopOptions.js";
import type { TaskPlan } from "../../../../planning/model/TaskPlan.js";
import { shouldUseDirectPlan } from "../../../../planning/core/PlannedTools.js";
import { StreamProgressReporter } from "../../../../protocol/events/stream/progress/StreamProgressReporter.js";

function toPlanEventPayload(taskPlan: TaskPlan): JsonObject {
  return {
    mode: taskPlan.mode,
    goal: taskPlan.goal,
    summary: taskPlan.summary,
    stop_when: taskPlan.stopWhen,
    sufficient: taskPlan.sufficient,
    required_tools: [...taskPlan.requiredTools],
    route_context: taskPlan.routeContext,
    source: taskPlan.source,
    steps: taskPlan.steps.map((step) => ({
      action: step.action,
      ...(step.toolName ? { tool_name: step.toolName } : {}),
      ...(step.arguments ? { arguments: step.arguments } : {}),
      reason: step.reason,
      ...(step.expectedOutcome ? { expected_outcome: step.expectedOutcome } : {}),
      sufficient: step.sufficient
    }))
  };
}

export class AgentChatStreamSession {
  private readonly missingOpenAiApiKeyFallbackGate = new AgentMissingOpenAiApiKeyFallbackGate();
  private readonly streamErrorMessageResolver = new AgentStreamErrorMessageResolver();
  private readonly inputSafetySanitizer = new InputSafetySanitizer();
  private readonly latestUserQueryResolver = new LatestUserQueryResolver();
  private readonly intentRouter = new IntentRouter();
  private readonly legacyMessagePreparer: LegacyMessagePreparer;
  private readonly taskPlanner: TaskPlanner;
  private readonly toolExplorer = new ToolExplorer();
  private readonly failureMemorySupport: FailureMemorySupport;
  private readonly contextCompactionService: ContextCompactionService;
  private readonly streamProgressReporter: StreamProgressReporter;
  private lastCompactionStats: JsonObject = {
    tokens_before: 0,
    tokens_after: 0,
    tokens_released: 0,
    compacted: false,
    dropped_messages: 0
  };
  private lastMemoryEnabled = false;

  constructor(
    private readonly openAiApiKey: string,
    private readonly config: AgentConfig,
    private readonly core: AgentCoreClient,
    private readonly contextPipeline: AgentContextPipeline,
    private readonly memoryTaskCompletionSubmitter: AgentMemoryTaskCompletionSubmitter,
    private readonly openAiClient: OpenAIChatClient,
    private readonly openAiToolFacade: AgentOpenAiToolFacade,
    private readonly skillRegistry?: SkillRegistry,
    streamProgressReporter?: StreamProgressReporter
  ) {
    this.contextCompactionService = new ContextCompactionService(
      config.contextWindowTokens,
      config.contextReserveTokens,
      config.contextKeepLastMessages
    );
    this.failureMemorySupport = new FailureMemorySupport(
      new FailureMemoryStore(config.failureMemoryPath || ".agent-data/failure-memory.jsonl"),
      config.failureMemoryScoreThreshold ?? 70
    );
    this.legacyMessagePreparer = new LegacyMessagePreparer(this.contextPipeline, this.contextCompactionService);
    this.taskPlanner = new TaskPlanner(config, openAiClient);
    this.streamProgressReporter = streamProgressReporter ?? new StreamProgressReporter();
  }

  getContextCompactionSnapshot(): JsonObject {
    return this.lastCompactionStats;
  }

  getMemoryEnabled(): boolean {
    return this.lastMemoryEnabled;
  }

  getGraphHealthSnapshot(): JsonObject {
    return {
      compiled: true,
      checkpoint: "typescript-runtime",
      nodes: [
        "validate_request",
        "load_memory",
        "load_rag",
        "load_web_fetch",
        "load_web_search",
        "load_mcp_tools",
        "load_workspace_tools",
        "load_web_tools",
        "load_rag_tools",
        "load_memory_tools",
        "generate",
        "finalize"
      ],
      workflow_nodes: ["select_skill", "load_memory", "decide_tool", "generate", "flush_memory", "finalize"],
      runtime: "typescript",
      core: "rust"
    };
  }

  getActionScoreSnapshot(): JsonObject {
    return {};
  }

  async stream(chatRequest: ChatStreamRequest, turnId: string, writer: SseWriter): Promise<void> {
    const traceRecorder = new FailureMemoryTraceRecorder();
    let failureQuery = "";
    let eventWriter: AgentStreamEventWriter | undefined;
    let progressVisible = false;
    const streamProgressReporter = this.streamProgressReporter;
    try {
      const streamWriter: SseWriter = {
        async start() {
          await writer.start();
          traceRecorder.record("sys_start", "system", { message: "stream_started" });
        },
        async write(event, source, payload) {
          if (event === "llm_data" || event === "llm_delta" || event === "delta") {
            progressVisible = true;
            streamProgressReporter.stop();
          }
          traceRecorder.record(event, source, payload);
          await writer.write(event, source, payload);
        },
        async done(finishReason) {
          streamProgressReporter.stop();
          traceRecorder.record("sys_done", "system", { finish_reason: finishReason });
          await writer.done(finishReason);
        },
        async error(code, message, retryable) {
          streamProgressReporter.stop();
          traceRecorder.record("sys_error", "system", { code, message, retryable });
          await writer.error(code, message, retryable);
        },
        get signal() {
          return writer.signal;
        }
      } as SseWriter;
      await streamWriter.start();
      streamProgressReporter.start(streamWriter, () => !progressVisible && !(writer.signal?.aborted), chatRequest.traceId ?? null);
      const safeChatRequest = this.inputSafetySanitizer.sanitize(chatRequest);
      eventWriter = new AgentStreamEventWriter(
        streamWriter,
        safeChatRequest.userId == null || safeChatRequest.sessionId == null,
        this.config.debugStream
      );
      failureQuery = this.latestUserQueryResolver.resolve(safeChatRequest);
      this.logStreamRequestContext(
        chatRequest.traceId ?? null,
        turnId,
        safeChatRequest.userId ?? null,
        safeChatRequest.sessionId ?? null
      );
      const failureAwareChatRequest = {
        ...safeChatRequest,
        messages: this.failureMemorySupport.injectAvoidancePrompt(safeChatRequest.messages, failureQuery)
      };
      const educationDomain = shouldForceEducationRag(failureQuery);
      const ragOnlyPreferred = preferRagOnly(failureQuery);
      const rawRoute = this.intentRouter.route(failureQuery, [
        "retrieval",
        "search",
        "memory_read",
        "memory_write",
        "skill",
        "student"
      ]);
      const availableTools = await this.openAiToolFacade.listTools();
      const route = preferRetrievalFallback(rawRoute, availableTools.some((tool) => tool.function.name === "rag_search"));
      const preparedMessages = await this.legacyMessagePreparer.prepare(safeChatRequest);
      this.lastMemoryEnabled = preparedMessages.memoryEnabled;
      this.lastCompactionStats = {
        tokens_before: preparedMessages.compactionStats?.tokensBefore ?? preparedMessages.modelMessages.length,
        tokens_after: preparedMessages.compactionStats?.tokensAfter ?? preparedMessages.modelMessages.length,
        tokens_released: preparedMessages.compactionStats?.tokensReleased ?? 0,
        compacted: preparedMessages.compactionStats?.compacted ?? false,
        dropped_messages: preparedMessages.compactionStats?.droppedMessages ?? 0,
        auto_compacted: preparedMessages.compactionStats?.autoCompacted ?? false,
        transcript_path: preparedMessages.compactionStats?.transcriptPath ?? "",
        latency_ms: preparedMessages.compactionStats?.latencyMs ?? 0
      };
      this.logContextCompaction(
        preparedMessages.compactionStats?.tokensReleased ?? 0,
        preparedMessages.compactionStats?.tokensBefore ?? preparedMessages.modelMessages.length,
        preparedMessages.compactionStats?.tokensAfter ?? preparedMessages.modelMessages.length,
        safeChatRequest.sessionId ?? null
      );
      if (preparedMessages.compactionStats?.compacted) {
        console.info(
          "context_autocompact_done session_id=%s transcript=%s",
          safeChatRequest.sessionId ?? null,
          preparedMessages.compactionStats?.transcriptPath ?? ""
        );
      }
      const graphState: GraphState = {
        messages: failureAwareChatRequest.messages,
        modelMessages: preparedMessages.modelMessages,
        userQuery: failureQuery,
        traceId: chatRequest.traceId ?? null,
        turnId
      };
      const selectedSkillState = await this.runGraph(
        graphState,
        route,
        availableTools,
        safeChatRequest,
        educationDomain,
        ragOnlyPreferred,
        streamWriter,
        eventWriter,
        streamWriter.signal
      );
      let finalAnswer = selectedSkillState.assistantAnswer ?? "";
      if (!selectedSkillState.graphContentEmitted) {
        const fallbackGraphState: GraphState = {
          messages: failureAwareChatRequest.messages,
          modelMessages: preparedMessages.modelMessages,
          userQuery: preparedMessages.userQuery,
          userId: safeChatRequest.userId ?? null,
          sessionId: safeChatRequest.sessionId ?? null,
          traceId: chatRequest.traceId ?? null,
          turnId,
          memoryEnabled: preparedMessages.memoryEnabled
        };
        finalAnswer = await this.runLegacyFallback(
          fallbackGraphState,
          route,
          safeChatRequest,
          eventWriter,
          streamWriter.signal
        );
      }
      this.failureMemorySupport.evaluateAndRecord(failureQuery, traceRecorder.events, turnId);
      await eventWriter.flushSafetyFilter();
      if (this.missingOpenAiApiKeyFallbackGate.shouldWrite(this.openAiApiKey, eventWriter.emitted)) {
        await eventWriter.writeMissingOpenAiApiKeyFallback();
      }
      if (this.config.debugStream) {
        console.info(
          "debug_stream ts done: deltas=%s, answer_preview=%s",
          eventWriter.deltaCount,
          eventWriter.debugPreview
        );
      }
      await streamWriter.done("stream_finished");
      await this.memoryTaskCompletionSubmitter.submit(chatRequest, turnId, finalAnswer);
    } catch (error) {
      this.streamProgressReporter.stop();
      this.failureMemorySupport.evaluateAndRecord(failureQuery, traceRecorder.events, turnId);
      if (writer.signal?.aborted) {
        return;
      }
      if (this.config.debugStream) {
        console.warn(
          "debug_stream ts error: deltas=%s, answer_preview=%s, error=%s",
          eventWriter?.deltaCount ?? 0,
          eventWriter?.debugPreview ?? "",
          error
        );
      }
      await writer.error("internal_error", this.streamErrorMessageResolver.resolve(error), true);
    } finally {
      this.streamProgressReporter.stop();
    }
  }

  private async runGraph(
    initial: GraphState,
    route: ReturnType<IntentRouter["route"]>,
    availableTools: Awaited<ReturnType<AgentOpenAiToolFacade["listTools"]>>,
    chatRequest: ChatStreamRequest,
    educationDomain: boolean,
    ragOnlyPreferred: boolean,
    writer: SseWriter,
    eventWriter: AgentStreamEventWriter,
    signal?: AbortSignal
  ): Promise<GraphState> {
    const graphRunner = new AgentGraphRunner(
      {
        load_memory: async (state) => ({
          ...state,
          memoryEnabled: Boolean(state.userId != null && state.sessionId != null && state.userQuery),
          modelMessages: this.contextCompactionService.compact(
            PromptBuilder.assembleMessages(
              await this.contextPipeline.build(
                {
                  ...chatRequest,
                  messages: [...state.messages]
                },
                route
              ),
              {
                skillPrompts: state.skillSystemPrompt ? [state.skillSystemPrompt] : []
              }
            )
          ).messages as ChatStreamRequest["messages"]
        }),
        decide_tool: async (state) => {
          let graphContentEmitted = Boolean(state.graphContentEmitted);
          const legacyRoute = buildLegacyRouteContext(route, route.matchedTools, educationDomain);
          const taskPlan: TaskPlan = await this.taskPlanner.planAsync({
            userQuery: String(state.userQuery ?? ""),
            availableTools,
            routeContext: buildPlannerRouteContext(route, legacyRoute.matchedTools, educationDomain || ragOnlyPreferred)
          });
          const exploration = this.toolExplorer.explore(
            String(state.userQuery ?? ""),
            availableTools,
            route.categories,
            taskPlan as unknown as JsonObject,
            [],
            chatRequest.messages
          );
          const exploredRoute = buildLegacyRouteContext(route, exploration.matchedTools, educationDomain);
          const routePayload = adjustRoutePayload(
            route.toEventPayload() as JsonObject,
            route,
            exploredRoute.matchedTools,
            route.matchedTools
          );
          graphContentEmitted = true;
          await writer.write("sys_intent_route", "system", routePayload);
          const routeReasoning = shouldEmitPlanningReasoning(educationDomain, exploration.reason !== "none")
            ? buildRouteReasoningPayload(
                [...exploredRoute.categories],
                exploredRoute.matchedTools,
                educationDomain
              )
            : undefined;
          if (routeReasoning) {
            graphContentEmitted = true;
            await writer.write("sys_reasoning", "system", routeReasoning);
          }
          const planReasoning = shouldEmitPlanningReasoning(educationDomain, exploration.reason !== "none")
            ? buildPlanReasoningPayload(taskPlan as unknown as JsonObject)
            : undefined;
          if (planReasoning) {
            graphContentEmitted = true;
            await writer.write("sys_reasoning", "system", buildDelegateReasoningPayload("task_planner_subagent"));
            graphContentEmitted = true;
            await writer.write("sys_tool_plan", "system", toPlanEventPayload(taskPlan));
            graphContentEmitted = true;
            await writer.write("sys_reasoning", "system", planReasoning);
          }
          const explorationState: GraphExplorationState = {
            summary: exploration.summary,
            reason: exploration.reason,
            matchedTools: exploration.matchedTools,
            sufficient: exploration.sufficient,
            evidence: exploration.evidence,
            toolCalls: exploration.toolCalls
          };
          return {
            ...state,
            ragEnabled: Boolean(String(state.userQuery ?? "").trim()),
            forceRag: false,
            educationDomain,
            webSearchEnabled: route.categories.has("search") || route.categories.has("retrieval"),
            routeCategories: [...exploredRoute.categories],
            matchedTools: exploredRoute.matchedTools,
            routePayload,
            routeReasoning,
            planReasoning,
            taskPlan,
            exploration: explorationState,
            forceFetchUrl: resolveForceFetchUrl(exploredRoute.matchedTools, String(state.userQuery ?? "")),
            useTool: !shouldUseDirectPlan(taskPlan) && exploration.reason !== "none",
            graphContentEmitted
          };
        },
        generate: async (state) => {
          const baseMessages = [...(state.modelMessages ?? state.messages)];
          let modelMessages = [...baseMessages];
          const taskPlan = state.taskPlan;
          const exploration = state.exploration;
          let graphContentEmitted = Boolean(state.graphContentEmitted);
          if (taskPlan) {
            modelMessages = PromptBuilder.assembleMessages(modelMessages, {
              dynamicPrompts: [PromptBuilder.renderTaskPlanPrompt(taskPlan as unknown as JsonObject)]
            });
          }
          if (taskPlan && exploration && exploration.reason !== "none" && !shouldUseDirectPlan(taskPlan)) {
            const explorerEvidence = exploration.evidence.map((item) => ({
              tool_name: item.tool_name,
              status: item.status,
              message: item.message,
              items: [...item.items]
            })) as JsonObject[];
            const explorerToolCalls = exploration.toolCalls.map((item) => ({ ...item })) as JsonObject[];
            modelMessages = PromptBuilder.assembleMessages(modelMessages, {
              dynamicPrompts: [buildExplorerContext({
                summary: exploration.summary,
                evidence: explorerEvidence,
                toolCalls: explorerToolCalls
              })]
            });
          }
          const loopWriter = async (event: Parameters<NonNullable<AgentLoopOptions["writer"]>>[0]) => {
            if (event.type === "delta" || event.type === "reasoning_delta") {
              graphContentEmitted = true;
            }
            await eventWriter.write(event);
          };
          const forceFetchUrl = state.forceFetchUrl ?? resolveForceFetchUrl(route.matchedTools, String(state.userQuery ?? ""));
          if (forceFetchUrl) {
            const fetchResult = await executeLegacyForceFetch(forceFetchUrl, async (toolName, args) => {
              const result = await this.openAiToolFacade.executeTool(chatRequest, toolName, args, signal);
              return { output: result.output, success: result.success };
            });
            graphContentEmitted = true;
            await writer.write("tool_use", "tool", {
              tool_name: "web_fetch",
              tool_call_id: "web_fetch-1",
              input: { url: forceFetchUrl, max_content_length: 4000 }
            });
            for (const event of fetchResult.events) {
              if (event.event === "tool_use") continue;
              const eventName = String(event.event);
              await writer.write(eventName, "tool", {
                tool_name: "web_fetch",
                tool_call_id: "web_fetch-1",
                payload: event.payload
              });
            }
            if (fetchResult.contextPrompt) {
              modelMessages = PromptBuilder.assembleMessages(modelMessages, {
                dynamicPrompts: [fetchResult.contextPrompt]
              });
            }
            if (this.config.debugStream && eventWriter) {
              console.info(
                "debug_stream python done: deltas=%s, answer_preview=%s",
                eventWriter.deltaCount,
                eventWriter.debugPreview
              );
            }
          }
          const loop = new AgentLoopFactory(
            this.config,
            this.core,
            this.openAiClient,
            this.openAiToolFacade,
            this.contextPipeline
          ).create(
            { ...chatRequest, messages: modelMessages },
            {
              maxTurns: 3,
              signal,
              writer: loopWriter,
              onEvent: (_event) => {},
              transformContext: (messages, loopSignal) => this.contextPipeline.transform(messages, loopSignal, route),
              toolPlan: taskPlan
            }
          );
          const loopResult = await loop.run();
          return {
            ...state,
            modelMessages,
            assistantAnswer: loopResult.answer,
            graphContentEmitted: graphContentEmitted || loopResult.emitted
          };
        },
        flush_memory: async (state) => state,
        finalize: async (state) => state
      },
      this.skillRegistry,
      this.skillRegistry
        ? async (prompt, responseFormat) => {
            const messages = [{ role: "user" as const, content: prompt }];
            if (responseFormat?.type === "json_object") {
              return this.openAiClient.chatWithJsonMode(messages, signal);
            }
            let responseText = "";
            for await (const delta of this.openAiClient.streamChat(messages, signal, responseFormat)) {
              responseText += delta;
            }
            return responseText;
          }
        : undefined
    );
    return graphRunner.run(initial, signal);
  }

  private async runLegacyFallback(
    state: GraphState,
    route: ReturnType<IntentRouter["route"]>,
    chatRequest: ChatStreamRequest,
    eventWriter: AgentStreamEventWriter,
      signal?: AbortSignal
  ): Promise<string> {
    try {
      const loop = new AgentLoopFactory(
        this.config,
        this.core,
        this.openAiClient,
        this.openAiToolFacade,
        this.contextPipeline
      ).create(
        { ...chatRequest, messages: [...(state.modelMessages ?? state.messages)] },
        {
          maxTurns: 3,
          signal,
          writer: (event) => eventWriter.write(event),
          onEvent: (_event) => {},
          transformContext: (messages, loopSignal) => this.contextPipeline.transform(messages, loopSignal, route)
        }
      );
      const loopResult = await loop.run();
      return loopResult.answer;
    } catch {
      return "";
    }
  }

  private logStreamRequestContext(
    traceId: string | null,
    turnId: string,
    userId: number | null,
    sessionId: number | null
  ): void {
    console.info(
      "stream_events start: trace_id=%s, turn_id=%s, session_id=%s, user_id=%s",
      traceId,
      turnId,
      sessionId,
      userId
    );
  }

  private logContextCompaction(tokensReleased: number, tokensBefore: number, tokensAfter: number, sessionId: number | null): void {
    if (tokensReleased > 0) {
      console.info(
        "context_compaction_released session_id=%s released=%s before=%s after=%s",
        sessionId,
        tokensReleased,
        tokensBefore,
        tokensAfter
      );
    }
  }
}
