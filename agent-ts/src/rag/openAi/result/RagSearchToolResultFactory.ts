import type { OpenAiToolExecutionResult } from "../../../openai/tools/runtime/model/result/OpenAiToolExecutionResult.js";
import type { RagSearchResult } from "../../context/model/RagSearchResult.js";

export class RagSearchToolResultFactory {
  create(results: RagSearchResult[]): OpenAiToolExecutionResult {
    const items = results.map((result) => ({
      id: result.documentId,
      documentId: result.documentId,
      docName: result.fileName,
      chunkIndex: result.chunkIndex,
      content: result.content,
      snippet: result.content,
      score: result.score ?? null
    }));
    return {
      output: JSON.stringify({
        ok: results.length > 0,
        status: results.length > 0 ? "hit" : "miss",
        message: results.length > 0 ? "hit" : "miss",
        items,
        derived: {
          sources: items.map(({ id, docName, snippet, score }) => ({ id, docName, snippet, score }))
        }
      }),
      success: true
    };
  }
}
