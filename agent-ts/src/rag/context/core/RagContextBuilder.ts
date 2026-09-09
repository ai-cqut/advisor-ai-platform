import type { ChatMessageDTO, ChatStreamRequest } from "../../../common/model/ChatStreamRequest.js";
import type { RagApiClient } from "../../api/core/RagApiClient.js";
import { RagSystemMessageFactory } from "../rendering/message/RagSystemMessageFactory.js";
import { RagPromptRenderer } from "../rendering/prompt/RagPromptRenderer.js";

export class RagContextBuilder {
  private readonly promptRenderer = new RagPromptRenderer();
  private readonly systemMessageFactory = new RagSystemMessageFactory();

  constructor(private readonly ragClient: RagApiClient) {}

  async injectRag(request: ChatStreamRequest): Promise<ChatMessageDTO[]> {
    try {
      const documents = await this.ragClient.listDocuments();
      const prompt = this.promptRenderer.render(documents);
      if (!prompt) {
        return request.messages;
      }
      return [this.systemMessageFactory.create(prompt), ...request.messages];
    } catch {
      return request.messages;
    }
  }

}
