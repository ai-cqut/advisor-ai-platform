import type { ChatMessageDTO } from "../common/model/ChatMessageDTO.js";

export interface EngineContext {
  readonly messages: ChatMessageDTO[];
  readonly userId?: number | null;
  readonly sessionId?: number | null;
  readonly traceId?: string | null;
  readonly turnId?: string | null;
}
