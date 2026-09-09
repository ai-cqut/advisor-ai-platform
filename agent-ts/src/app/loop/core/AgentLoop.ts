import type { OpenAIToolCall } from "../../../openai/tools/runtime/model/call/OpenAIToolCall.js";
import { OpenAIToolConversationAppender } from "../../../openai/tools/runtime/state/conversation/OpenAIToolConversationAppender.js";
import type { OpenAIChatStreamEvent } from "../../../protocol/events/model/openai/OpenAIChatStreamEvent.js";
import type { AgentLoopOptions, AgentLoopResult, AgentLoopToolCall, AgentLoopToolResult } from "../model/AgentLoopOptions.js";
import { ToolTimeoutPolicy } from "../timeout/ToolTimeoutPolicy.js";
import { plannedToolSteps } from "../../../planning/core/PlannedTools.js";

export class AgentLoop {
  constructor(private readonly options: AgentLoopOptions) {}

  private readonly toolTimeoutPolicy = new ToolTimeoutPolicy();
  private readonly maxToolRetries = 3;

  async run(): Promise<AgentLoopResult> {
    const { onEvent } = this.options;
    await onEvent?.({ type: "agent_start" });
    let conversation = structuredClone(this.options.chatRequest.messages);
    let turns = 0;
    let answerText = "";
    let emitted = false;
    const maxTurns = this.options.maxTurns ?? 3;
    const appender = new OpenAIToolConversationAppender();
    let plannedToolsExecuted = false;
    while (turns < maxTurns && !this.options.signal?.aborted) {
      turns++;
      await onEvent?.({ type: "turn_start", turn: turns });
      if (!plannedToolsExecuted) {
        const steps = plannedToolSteps(this.options.toolPlan);
        if (steps.length > 0) {
          await this.executePlannedTools(steps, conversation, appender, turns, onEvent);
        }
        plannedToolsExecuted = true;
      }
      if (this.options.transformContext) {
        conversation = await this.options.transformContext(conversation, this.options.signal);
      }
      const toolCalls: AgentLoopToolCall[] = [];
      if (this.options.forceDirectGeneration) {
        let sawDelta = false;
        const providerStartedAt = Date.now();
        await onEvent?.({ type: "provider_request_start", turn: turns });
        try {
          for await (const event of this.options.stream(conversation, this.options.signal)) {
            if (event.type === "delta") {
              sawDelta = true;
              emitted = true;
              answerText += event.text;
              await this.options.writer?.(event);
            } else if (event.type === "reasoning_delta") {
              await this.options.writer?.(event);
            }
          }
          await onEvent?.({
            type: "provider_request_end",
            turn: turns,
            status: "success",
            durationMs: Date.now() - providerStartedAt
          });
        } catch (error) {
          await onEvent?.({
            type: "provider_request_end",
            turn: turns,
            status: this.options.signal?.aborted ? "aborted" : "error",
            durationMs: Date.now() - providerStartedAt,
            errorCode: this.errorCode(error)
          });
          throw error;
        }
        if (!sawDelta) {
          throw new Error("stream finished without content");
        }
        await onEvent?.({ type: "turn_end", turn: turns });
        break;
      }
      const providerStartedAt = Date.now();
      await onEvent?.({ type: "provider_request_start", turn: turns });
      try {
        for await (const event of this.options.stream(conversation, this.options.signal)) {
          if (event.type === "delta") {
            emitted = true;
            answerText += event.text;
            await this.options.writer?.(event);
          } else if (event.type === "reasoning_delta") {
            await this.options.writer?.(event);
          } else if (event.type === "tool_call") {
            toolCalls.push({ id: event.toolCallId, name: event.toolName, args: event.toolArgs });
            await this.options.writer?.(event);
          }
        }
        await onEvent?.({
          type: "provider_request_end",
          turn: turns,
          status: "success",
          durationMs: Date.now() - providerStartedAt
        });
      } catch (error) {
        await onEvent?.({
          type: "provider_request_end",
          turn: turns,
          status: this.options.signal?.aborted ? "aborted" : "error",
          durationMs: Date.now() - providerStartedAt,
          errorCode: this.errorCode(error)
        });
        throw error;
      }
      if (toolCalls.length === 0) {
        await onEvent?.({ type: "turn_end", turn: turns });
        break;
      }
      const openAiToolCalls: OpenAIToolCall[] = toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: "function" as const,
        function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) }
      }));
      appender.appendAssistantToolCalls(conversation as unknown as Parameters<typeof appender.appendAssistantToolCalls>[0], openAiToolCalls);
      const results = await Promise.all(toolCalls.map((toolCall) => this.executeToolCall(toolCall, turns, onEvent)));
      for (const [index, toolCall] of toolCalls.entries()) {
        const result = results[index];
        const openAiToolCall = openAiToolCalls.find((candidate) => candidate.id === toolCall.id);
        if (openAiToolCall) {
          appender.appendToolResult(
            conversation as unknown as Parameters<typeof appender.appendToolResult>[0],
            openAiToolCall,
            result.output
          );
        }
        const writerEvent: OpenAIChatStreamEvent = {
          type: "tool_result",
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolArgs: toolCall.args,
          toolOutput: result.output,
          attempt: result.attempt ?? 0,
          success: result.success
        };
        await this.options.writer?.(writerEvent);
      }
      await onEvent?.({ type: "turn_end", turn: turns });
      if (this.options.transformContext) {
        conversation = await this.options.transformContext(conversation, this.options.signal);
      }
    }
    await onEvent?.({ type: "agent_end", turns, answer: answerText });
    return { answer: answerText, emitted, turns };
  }

  private async executePlannedTools(
    steps: ReturnType<typeof plannedToolSteps>,
    conversation: Parameters<OpenAIToolConversationAppender["appendAssistantToolCalls"]>[0],
    appender: OpenAIToolConversationAppender,
    turn: number,
    onEvent: AgentLoopOptions["onEvent"]
  ): Promise<void> {
    const plannedCalls: AgentLoopToolCall[] = steps.map((step, index) => ({
      id: `plan-${index + 1}-${step.toolName}`,
      name: step.toolName,
      args: step.arguments ?? {}
    }));
    const openAiToolCalls: OpenAIToolCall[] = plannedCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) }
    }));
    appender.appendAssistantToolCalls(conversation, openAiToolCalls);
    for (const toolCall of plannedCalls) {
      await this.options.writer?.({
        type: "tool_call",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolArgs: toolCall.args
      });
      const result = await this.executeToolCall(toolCall, turn, onEvent);
      appender.appendToolResult(conversation, openAiToolCalls.find((item) => item.id === toolCall.id)!, result.output);
      await this.options.writer?.({
        type: "tool_result",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolArgs: toolCall.args,
        toolOutput: result.output,
        attempt: result.attempt ?? 0,
        success: result.success
      });
    }
  }

  private async executeToolCall(
    toolCall: AgentLoopToolCall,
    turn: number,
    onEvent: AgentLoopOptions["onEvent"]
  ): Promise<AgentLoopToolResult> {
    const toolStartedAt = Date.now();
    await onEvent?.({
      type: "tool_execution_start",
      turn,
      toolCallId: toolCall.id,
      toolName: toolCall.name
    });
    let toolResultForEvent: AgentLoopToolResult | undefined;
    try {
      if (this.options.signal?.aborted) {
        throw new Error("Agent stream aborted");
      }
      const allowed = this.options.beforeToolCall
        ? await this.options.beforeToolCall({ toolCall, signal: this.options.signal })
        : true;
      let result: AgentLoopToolResult;
      if (allowed === false) {
        result = {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: JSON.stringify({ ok: false, status: "blocked", message: "tool blocked by policy", items: [] }),
          attempt: 0,
          success: false
        };
      } else {
        let lastResult: AgentLoopToolResult | undefined;
        for (let attempt = 1; attempt <= this.maxToolRetries; attempt++) {
          const toolResult = await this.toolTimeoutPolicy.execute(
            this.options.toolTimeoutMs?.(toolCall.name),
            this.options.signal,
            (toolSignal) => this.options.executeTool(
              this.options.chatRequest,
              toolCall.name,
              toolCall.args,
              toolSignal
            )
          );
          if (this.options.signal?.aborted) {
            throw new Error("Agent stream aborted");
          }
          lastResult = {
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            output: toolResult.output,
            attempt,
            success: toolResult.success
          };
          if (toolResult.success) {
            break;
          }
        }
        result = lastResult ?? {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: JSON.stringify({ ok: false, status: "error", message: "tool execution failed", items: [] }),
          attempt: this.maxToolRetries,
          success: false
        };
        if (this.options.afterToolCall) {
          const rewritten = await this.options.afterToolCall({ toolCall, result, signal: this.options.signal });
          if (rewritten) {
            result = rewritten;
          }
        }
      }
      toolResultForEvent = result;
      return result;
    } finally {
      await onEvent?.({
        type: "tool_execution_end",
        turn,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: toolResultForEvent?.success ?? false,
        durationMs: Date.now() - toolStartedAt
      });
    }
  }

  private errorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
}
