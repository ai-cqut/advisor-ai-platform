export interface RagSearchResult {
  documentId: number;
  fileName: string;
  chunkIndex: number;
  content: string;
  score?: number | null;
}
