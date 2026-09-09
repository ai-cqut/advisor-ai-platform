import type { JsonObject } from "../../../../common/json/types/JsonTypes.js";
import type { ChatStreamRequest } from "../../../../common/model/ChatStreamRequest.js";
import { LatestUserQueryResolver } from "../../../../common/request/resolver/LatestUserQueryResolver.js";
import { OpenAiToolArgumentReader } from "../../../../openai/tools/arguments/core/reader/OpenAiToolArgumentReader.js";
import { OpenAiToolTopKArgumentReader } from "../../../../openai/tools/arguments/core/topK/OpenAiToolTopKArgumentReader.js";
import type { MemoryReadRequest } from "../../../model/request/tool/read/MemoryReadRequest.js";

export class MemoryReadRequestReader {
  private readonly latestUserQueryResolver = new LatestUserQueryResolver();

  constructor(private readonly defaultTopK: number) {}

  read(request: ChatStreamRequest, args: JsonObject): MemoryReadRequest {
    const userId = this.requireUserId(request);
    const query = OpenAiToolArgumentReader.readOptionalString(args, "query", this.latestUserQueryResolver.resolve(request)) || "";
    if (!query.trim()) {
      throw new Error("memory_read empty query");
    }
    return {
      userId,
      query,
      topK: this.readTopK(args)
    };
  }

  private readTopK(args: JsonObject): number {
    return OpenAiToolTopKArgumentReader.read(args, this.defaultTopK);
  }

  private requireUserId(request: ChatStreamRequest): number {
    if (!request.userId) {
      throw new Error("memory tool missing user_id");
    }
    return request.userId;
  }
}
