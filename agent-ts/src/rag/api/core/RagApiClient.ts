import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import type { RagDocument } from "../../context/model/RagDocument.js";
import type { RagSearchResult } from "../../context/model/RagSearchResult.js";
import { RagApiHttpClient } from "../http/RagApiHttpClient.js";

export class RagApiClient {
  private readonly httpClient: RagApiHttpClient;

  constructor(config: AgentConfig) {
    this.httpClient = new RagApiHttpClient(config);
  }

  async listDocuments(): Promise<RagDocument[]> {
    const data = await this.httpClient.request<RagDocument[]>("/internal/rag/documents");
    return Array.isArray(data) ? (data as RagDocument[]) : [];
  }

  async searchDocuments(query: string, topK: number): Promise<RagSearchResult[]> {
    const data = await this.httpClient.request<RagSearchResult[]>("/internal/rag/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, topK })
    });
    return Array.isArray(data) ? (data as RagSearchResult[]) : [];
  }
}
