import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import type { RagDocument } from "../../context/model/RagDocument.js";
import { RagApiHttpClient } from "../http/RagApiHttpClient.js";
import { RagReadyDocumentSelector } from "../../context/selection/RagReadyDocumentSelector.js";
import { RagDocumentRanker } from "../../context/ranking/RagDocumentRanker.js";

export class RagApiClient {
  private readonly httpClient: RagApiHttpClient;
  private readonly readyDocumentSelector = new RagReadyDocumentSelector();
  private readonly documentRanker = new RagDocumentRanker();

  constructor(config: AgentConfig) {
    this.httpClient = new RagApiHttpClient(config);
  }

  async listDocuments(): Promise<RagDocument[]> {
    const data = await this.httpClient.request<RagDocument[]>("/internal/rag/documents");
    return Array.isArray(data) ? (data as RagDocument[]) : [];
  }

  async searchDocuments(query: string, topK: number): Promise<RagDocument[]> {
    const documents = await this.listDocuments();
    const readyDocuments = this.readyDocumentSelector.select(documents);
    return this.documentRanker.rank(readyDocuments, query).slice(0, topK);
  }
}
