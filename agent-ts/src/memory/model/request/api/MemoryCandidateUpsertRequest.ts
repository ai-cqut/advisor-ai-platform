import type { MemoryCandidateInput } from "../../input/MemoryCandidateInput.js";

export interface MemoryCandidateUpsertRequest {
  userId: number;
  candidates: MemoryCandidateInput[];
}
