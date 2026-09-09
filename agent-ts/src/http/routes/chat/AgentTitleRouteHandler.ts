import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime } from "../../../app/runtime/core/AgentRuntime.js";
import type { AgentHttpRequestReader } from "../../request/reader/AgentHttpRequestReader.js";
import type { HttpRouteResult } from "../../response/model/HttpRouteResult.js";

export class AgentTitleRouteHandler {
  constructor(
    private readonly runtime: AgentRuntime,
    private readonly requestReader: AgentHttpRequestReader
  ) {}

  async handle(
    method: string | undefined,
    url: URL,
    request: IncomingMessage,
    _response: ServerResponse
  ): Promise<HttpRouteResult | null> {
    if (method !== "POST" || url.pathname !== "/chat/title") return null;
    const body = await this.requestReader.readJsonObject(request);
    const question = this.requestReader.readRequiredString(body, "question");
    try {
      return { statusCode: 200, body: { title: await this.runtime.summarizeTitle(question) } };
    } catch (error) {
      return {
        statusCode: 502,
        body: { detail: error instanceof Error ? error.message : "title generation failed" }
      };
    }
  }
}
