import type { ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import { LatestUserQueryResolver } from "../../../common/request/resolver/LatestUserQueryResolver.js";
import { OpenAiToolArgumentReader } from "../../../openai/tools/arguments/core/reader/OpenAiToolArgumentReader.js";
import { OpenAiToolTopKArgumentReader } from "../../../openai/tools/arguments/core/topK/OpenAiToolTopKArgumentReader.js";
import type { OpenAiToolExecutionResult } from "../../../openai/tools/runtime/model/result/OpenAiToolExecutionResult.js";
import type { RagApiClient } from "../../api/core/RagApiClient.js";
import { RagDocumentRanker } from "../../context/ranking/RagDocumentRanker.js";
import { RagReadyDocumentSelector } from "../../context/selection/RagReadyDocumentSelector.js";
import { RagSearchToolResultFactory } from "../result/RagSearchToolResultFactory.js";

export class RagOpenAiToolExecutor {
  private readonly documentRanker = new RagDocumentRanker();
  private readonly latestUserQueryResolver = new LatestUserQueryResolver();
  private readonly readyDocumentSelector = new RagReadyDocumentSelector();
  private readonly resultFactory = new RagSearchToolResultFactory();

  constructor(private readonly ragClient: RagApiClient) {}

  async execute(request: ChatStreamRequest, args: JsonObject): Promise<OpenAiToolExecutionResult> {
    const query = OpenAiToolArgumentReader.readOptionalString(args, "query", this.latestUserQueryResolver.resolve(request));
    const topK = OpenAiToolTopKArgumentReader.read(args, 5);
    const documents = await this.ragClient.listDocuments();
    const readyDocuments = this.readyDocumentSelector.select(documents);
    const matchedDocuments = this.documentRanker.rank(readyDocuments, query).slice(0, topK);
    return this.resultFactory.create(matchedDocuments);
  }

}
