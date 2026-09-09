import type { JsonObject } from "../../../../common/json/types/JsonTypes.js";
import type { ChatStreamRequest } from "../../../../common/model/ChatStreamRequest.js";
import type { MemoryWriteRequest } from "../../../model/request/tool/write/MemoryWriteRequest.js";
import { MemoryCandidateReader } from "../../candidate/MemoryCandidateReader.js";

export class MemoryWriteRequestReader {
  private readonly candidateReader = new MemoryCandidateReader();

  read(request: ChatStreamRequest, args: JsonObject): MemoryWriteRequest {
    return {
      userId: this.requireUserId(request),
      candidates: this.candidateReader.readCandidates(args)
    };
  }

  private requireUserId(request: ChatStreamRequest): number {
    if (!request.userId) {
      throw new Error("memory tool missing user_id");
    }
    return request.userId;
  }
}
