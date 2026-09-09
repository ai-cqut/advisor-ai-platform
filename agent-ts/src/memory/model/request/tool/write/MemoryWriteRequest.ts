import type { MemoryCandidateInput } from "../../../input/MemoryCandidateInput.js";

export interface MemoryWriteRequest {
  userId: number;
  candidates: MemoryCandidateInput[];
}
