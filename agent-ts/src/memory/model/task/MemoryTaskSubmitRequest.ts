export interface MemoryTaskSubmitRequest {
  userId: number;
  sessionId: number;
  turnId: string;
  userText: string;
  assistantText: string;
  recentMessages: { role: string; content: string }[];
}
