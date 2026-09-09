import type { MemoryApiClient } from "../../api/core/MemoryApiClient.js";
import type { MemoryContextLoadResult } from "../model/MemoryContextLoadResult.js";

export class MemoryContextLoader {
  constructor(
    private readonly memoryClient: MemoryApiClient,
    private readonly topK: number
  ) {}

  async load(userId: number, sessionId: number, userQuery: string): Promise<MemoryContextLoadResult> {
    const [summary, coreMemories, longTermMemories] = await Promise.all([
      this.memoryClient.getSessionSummary(sessionId),
      this.memoryClient.getCoreMemories(userId),
      this.memoryClient.searchLongTerm(userId, userQuery, this.topK)
    ]);
    return { summary, coreMemories, longTermMemories };
  }
}
