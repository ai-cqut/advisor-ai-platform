import type { JsonObject } from "../../../../common/json/types/JsonTypes.js";
import type { SseWriter } from "../../../sse/writer/SseWriter.js";

export class AgentStreamEventEmitter {
  constructor(
    private readonly writer: SseWriter,
    private readonly useDeltaEvent: boolean = false
  ) {}

  async writeDelta(text: string): Promise<void> {
    await this.writer.write(this.useDeltaEvent ? "llm_delta" : "llm_data", "llm", { text });
  }

  async writeReasoningDelta(text: string): Promise<void> {
    await this.writer.write("reasoning_delta", "llm", { text });
  }

  async writeToolCall(toolCallId: string, toolName: string, toolArgs: JsonObject): Promise<void> {
    await this.writer.write("tool_call", "tool", {
      tool_call_id: toolCallId,
      tool_name: toolName,
      tool_args: toolArgs
    });
  }

  async writeToolResult(
    toolCallId: string,
    toolName: string,
    toolArgs: JsonObject,
    toolOutput: string,
    attempt: number,
    success: boolean
  ): Promise<void> {
    const parsedOutput = this.parseToolOutput(toolOutput);
    await this.writer.write("tool_result", "tool", {
      tool_call_id: toolCallId,
      tool_name: toolName,
      tool_args: toolArgs,
      tool_output: toolOutput,
      attempt,
      success,
      ...(parsedOutput ?? {})
    });
  }

  private parseToolOutput(toolOutput: string): JsonObject | undefined {
    try {
      const parsed = JSON.parse(toolOutput) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return undefined;
      }
      return parsed as JsonObject;
    } catch {
      return undefined;
    }
  }
}
