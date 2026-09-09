import type { ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { MemoryApiClient } from "../../api/core/MemoryApiClient.js";
import { LastUserMessageFinder } from "../../context/support/LastUserMessageFinder.js";
import { MemoryTaskRecentMessagesBuilder } from "../builder/MemoryTaskRecentMessagesBuilder.js";

export class MemoryTaskSubmitter {
  private readonly lastUserMessageFinder = new LastUserMessageFinder();
  private readonly recentMessagesBuilder = new MemoryTaskRecentMessagesBuilder();

  constructor(private readonly memoryClient: MemoryApiClient) {}

  async submit(request: ChatStreamRequest, turnId: string, assistantText: string): Promise<void> {
    if (!request.userId || !request.sessionId) {
      return;
    }
    const userText = this.lastUserMessageFinder.find(request.messages);
    if (!userText) {
      return;
    }

    try {
      await this.memoryClient.submitMemoryTask({
        userId: request.userId,
        sessionId: request.sessionId,
        turnId,
        userText,
        assistantText,
        recentMessages: this.recentMessagesBuilder.build(request, assistantText)
      });
    } catch {
      // 记忆写回失败不能影响聊天主链路。
    }
  }

}
