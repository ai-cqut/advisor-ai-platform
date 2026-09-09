import type { JsonObject } from "../../../../../common/json/types/JsonTypes.js";
import type { ChatStreamRequest } from "../../../../../common/model/ChatStreamRequest.js";
import type { OpenAiToolExecutionResult } from "../../../../../openai/tools/runtime/model/result/OpenAiToolExecutionResult.js";
import type { MemoryApiClient } from "../../../../api/core/MemoryApiClient.js";
import type { MemoryReadRequestReader } from "../../../../request/tool/read/MemoryReadRequestReader.js";
import type { MemoryToolResultFormatter } from "../../formatting/MemoryToolResultFormatter.js";

export class MemoryReadOpenAiToolExecutor {
  constructor(
    private readonly memoryClient: MemoryApiClient,
    private readonly readRequestReader: MemoryReadRequestReader,
    private readonly resultFormatter: MemoryToolResultFormatter
  ) {}

  async execute(request: ChatStreamRequest, args: JsonObject): Promise<OpenAiToolExecutionResult> {
    const readRequest = this.readRequestReader.read(request, args);
    const items = await this.memoryClient.searchLongTerm(
      readRequest.userId,
      readRequest.query,
      readRequest.topK
    );
    return this.resultFormatter.formatRead(items);
  }
}
