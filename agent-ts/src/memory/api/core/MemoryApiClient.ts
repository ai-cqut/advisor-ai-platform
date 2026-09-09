import type { JsonObject } from "../../../common/json/types/JsonTypes.js";
import type { SessionSummary } from "../../../common/session/SessionSummary.js";
import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import { MemoryApiArrayResponseReader } from "../reader/MemoryApiArrayResponseReader.js";
import { MemoryApiEndpointFactory } from "../factory/endpoint/MemoryApiEndpointFactory.js";
import { MemoryApiHttpClient } from "../http/MemoryApiHttpClient.js";
import { MemoryApiPostRequestFactory } from "../factory/request/MemoryApiPostRequestFactory.js";
import type { MemoryCandidateUpsertRequest } from "../../model/request/api/MemoryCandidateUpsertRequest.js";
import type { MemoryItem } from "../../model/entity/MemoryItem.js";
import type { MemoryTaskSubmitRequest } from "../../model/task/MemoryTaskSubmitRequest.js";

export class MemoryApiClient {
  private readonly arrayResponseReader = new MemoryApiArrayResponseReader();
  private readonly endpointFactory = new MemoryApiEndpointFactory();
  private readonly httpClient: MemoryApiHttpClient;
  private readonly postRequestFactory = new MemoryApiPostRequestFactory();

  constructor(config: AgentConfig) {
    this.httpClient = new MemoryApiHttpClient(config);
  }

  async searchLongTerm(userId: number, query: string, topK: number): Promise<MemoryItem[]> {
    const response = await this.httpClient.request<MemoryItem[]>(
      this.endpointFactory.longTermSearch(),
      this.postRequestFactory.createLongTermSearch(userId, query, topK)
    );
    return this.arrayResponseReader.read(response);
  }

  async getCoreMemories(userId: number): Promise<MemoryItem[]> {
    const response = await this.httpClient.request<MemoryItem[]>(this.endpointFactory.coreMemories(userId));
    return this.arrayResponseReader.read(response);
  }

  async getSessionSummary(sessionId: number): Promise<SessionSummary | null> {
    return this.httpClient.request<SessionSummary | null>(this.endpointFactory.sessionSummary(sessionId));
  }

  async upsertCandidates(params: MemoryCandidateUpsertRequest): Promise<JsonObject> {
    return this.httpClient.request<JsonObject>(
      this.endpointFactory.longTermCandidates(),
      this.postRequestFactory.createCandidateUpsert(params)
    );
  }

  async submitMemoryTask(params: MemoryTaskSubmitRequest): Promise<JsonObject> {
    return this.httpClient.request<JsonObject>(
      this.endpointFactory.memoryTaskSubmit(),
      this.postRequestFactory.createMemoryTaskSubmit(params)
    );
  }
}
