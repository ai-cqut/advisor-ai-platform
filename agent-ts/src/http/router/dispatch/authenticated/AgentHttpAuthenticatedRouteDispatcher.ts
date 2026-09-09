import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentWorkspaceRouteHandler } from "../../../../workspace/routes/core/handler/AgentWorkspaceRouteHandler.js";
import type { AgentHttpRouteResultWriter } from "../../../response/core/route/AgentHttpRouteResultWriter.js";
import type { AgentJsonResponseWriter } from "../../../response/core/json/AgentJsonResponseWriter.js";
import type { AgentChatStreamRouteHandler } from "../../../routes/chat/AgentChatStreamRouteHandler.js";
import type { AgentMcpRouteHandler } from "../../../routes/mcp/core/AgentMcpRouteHandler.js";
import type { AgentModelRouteHandler } from "../../../routes/models/AgentModelRouteHandler.js";
import type { AgentTitleRouteHandler } from "../../../routes/chat/AgentTitleRouteHandler.js";

export class AgentHttpAuthenticatedRouteDispatcher {
  constructor(
    private readonly chatStreamRouteHandler: AgentChatStreamRouteHandler,
    private readonly jsonResponseWriter: AgentJsonResponseWriter,
    private readonly modelRouteHandler: AgentModelRouteHandler,
    private readonly mcpRouteHandler: AgentMcpRouteHandler,
    private readonly routeResultWriter: AgentHttpRouteResultWriter,
    private readonly workspaceRouteHandler: AgentWorkspaceRouteHandler,
    private readonly titleRouteHandler: AgentTitleRouteHandler
  ) {}

  async dispatch(url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const modelResult = await this.modelRouteHandler.handle(request.method, url);
    if (this.routeResultWriter.writeIfPresent(response, modelResult)) return;
    if (await this.chatStreamRouteHandler.handle(request.method, url, request, response)) {
      return;
    }
    const titleResult = await this.titleRouteHandler.handle(request.method, url, request, response);
    if (this.routeResultWriter.writeIfPresent(response, titleResult)) {
      return;
    }

    const workspaceResult = await this.workspaceRouteHandler.handle(request.method, url, request);
    if (this.routeResultWriter.writeIfPresent(response, workspaceResult)) {
      return;
    }

    const mcpResult = await this.mcpRouteHandler.handle(request.method, url, request);
    if (this.routeResultWriter.writeIfPresent(response, mcpResult)) {
      return;
    }

    this.jsonResponseWriter.write(response, 404, { detail: "not found" });
  }
}
