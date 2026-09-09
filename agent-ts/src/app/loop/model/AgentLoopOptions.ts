import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import type { ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { OpenAIChatStreamEvent } from "../../../protocol/events/model/openai/OpenAIChatStreamEvent.js";
import type { TaskPlan } from "../../../planning/model/TaskPlan.js";

export type AgentLoopToolCall = {
  id: string;
  name: string;
  args: JsonObject;
};

export type AgentLoopToolResult = {
  toolCallId: string;
  toolName: string;
  output: string;
  attempt?: number;
  success: boolean;
};

export type AgentBeforeToolCallContext = {
  toolCall: AgentLoopToolCall;
  signal?: AbortSignal;
};

export type AgentAfterToolCallContext = {
  toolCall: AgentLoopToolCall;
  result: AgentLoopToolResult;
  signal?: AbortSignal;
};

export type AgentStreamFn = (
  messages: ChatStreamRequest["messages"],
  signal?: AbortSignal
) => AsyncGenerator<OpenAIChatStreamEvent>;

export type AgentLoopEvent =
  | { type: "agent_start" }
  | { type: "turn_start"; turn: number }
  | {
      type: "provider_request_start";
      turn: number;
      messages: ChatStreamRequest["messages"];
    }
  | {
      type: "provider_request_end";
      turn: number;
      status: "success" | "error" | "aborted";
      durationMs: number;
      errorCode?: string;
    }
  | { type: "tool_execution_start"; turn: number; toolCallId: string; toolName: string }
  | {
      type: "tool_execution_end";
      turn: number;
      toolCallId: string;
      toolName: string;
      success: boolean;
      durationMs: number;
    }
  | { type: "turn_end"; turn: number }
  | { type: "agent_end"; turns: number; answer: string };

export interface AgentLoopOptions {
  stream: AgentStreamFn;
  executeTool: (
    chatRequest: ChatStreamRequest,
    toolName: string,
    args: JsonObject,
    signal?: AbortSignal
  ) => Promise<{ output: string; success: boolean }>;
  toolTimeoutMs?: (toolName: string) => number | undefined;
  chatRequest: ChatStreamRequest;
  transformContext?: (
    messages: ChatStreamRequest["messages"],
    signal?: AbortSignal
  ) => Promise<ChatStreamRequest["messages"]>;
  beforeToolCall?: (context: AgentBeforeToolCallContext) => Promise<boolean | undefined>;
  afterToolCall?: (context: AgentAfterToolCallContext) => Promise<AgentLoopToolResult | undefined>;
  writer?: (event: OpenAIChatStreamEvent) => Promise<void>;
  maxTurns?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentLoopEvent) => void | Promise<void>;
  toolPlan?: TaskPlan;
  forceDirectGeneration?: boolean;
}

export interface AgentLoopResult {
  answer: string;
  emitted: boolean;
  turns: number;
}
