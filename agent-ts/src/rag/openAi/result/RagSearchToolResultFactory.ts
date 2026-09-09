import type { OpenAiToolExecutionResult } from "../../../openai/tools/runtime/model/result/OpenAiToolExecutionResult.js";
import type { RagSearchResult } from "../../context/model/RagSearchResult.js";

export class RagSearchToolResultFactory {
  create(results: RagSearchResult[]): OpenAiToolExecutionResult {
    return {
      output: JSON.stringify({
        ok: results.length > 0,
        status: results.length > 0 ? "hit" : "miss",
        message: results.length > 0 ? "hit" : "miss",
        items: results.map((result) => ({
          documentId: result.documentId,
          docName: result.fileName,
          chunkIndex: result.chunkIndex,
          content: result.content,
          snippet: result.content,
          score: result.score ?? null
        }))
      }),
      success: true
    };
  }
}
