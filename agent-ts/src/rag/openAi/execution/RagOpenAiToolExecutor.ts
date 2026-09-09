import type { ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import { LatestUserQueryResolver } from "../../../common/request/resolver/LatestUserQueryResolver.js";
import { OpenAiToolArgumentReader } from "../../../openai/tools/arguments/core/reader/OpenAiToolArgumentReader.js";
import { OpenAiToolTopKArgumentReader } from "../../../openai/tools/arguments/core/topK/OpenAiToolTopKArgumentReader.js";
import type { OpenAiToolExecutionResult } from "../../../openai/tools/runtime/model/result/OpenAiToolExecutionResult.js";
import type { RagApiClient } from "../../api/core/RagApiClient.js";
import { RagSearchToolResultFactory } from "../result/RagSearchToolResultFactory.js";

export class RagOpenAiToolExecutor {
  private readonly latestUserQueryResolver = new LatestUserQueryResolver();
  private readonly resultFactory = new RagSearchToolResultFactory();

  constructor(private readonly ragClient: RagApiClient) {}

  async execute(request: ChatStreamRequest, args: JsonObject): Promise<OpenAiToolExecutionResult> {
    const query = OpenAiToolArgumentReader.readOptionalString(args, "query", this.latestUserQueryResolver.resolve(request));
    const topK = OpenAiToolTopKArgumentReader.read(args, 5);
    const results = await this.ragClient.searchDocuments(query, topK);
    return this.resultFactory.create(results);
  }

}
