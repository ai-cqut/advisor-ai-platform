import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentWorkspaceRouteHandler } from "../../../workspace/routes/core/handler/AgentWorkspaceRouteHandler.js";
import type { AgentRequestUrlFactory } from "../../request/url/AgentRequestUrlFactory.js";
import { AgentHttpRouteResultWriter } from "../../response/core/route/AgentHttpRouteResultWriter.js";
import type { AgentJsonResponseWriter } from "../../response/core/json/AgentJsonResponseWriter.js";
import type { AgentChatStreamRouteHandler } from "../../routes/chat/AgentChatStreamRouteHandler.js";
import type { AgentHealthRouteHandler } from "../../routes/health/AgentHealthRouteHandler.js";
import type { AgentModelRouteHandler } from "../../routes/models/AgentModelRouteHandler.js";
import type { AgentMcpRouteHandler } from "../../routes/mcp/core/AgentMcpRouteHandler.js";
import type { AgentTitleRouteHandler } from "../../routes/chat/AgentTitleRouteHandler.js";
import { AgentHttpAuthenticatedRouteDispatcher } from "../dispatch/authenticated/AgentHttpAuthenticatedRouteDispatcher.js";
import { AgentHttpPublicRouteDispatcher } from "../dispatch/public/AgentHttpPublicRouteDispatcher.js";
import type { AgentRequestAuthorizer } from "../security/AgentRequestAuthorizer.js";

export class AgentHttpRouter {
  private readonly authenticatedRouteDispatcher: AgentHttpAuthenticatedRouteDispatcher;
  private readonly publicRouteDispatcher: AgentHttpPublicRouteDispatcher;
  private readonly routeResultWriter: AgentHttpRouteResultWriter;

  constructor(
    private readonly authorizer: AgentRequestAuthorizer,
    private readonly chatStreamRouteHandler: AgentChatStreamRouteHandler,
    private readonly healthRouteHandler: AgentHealthRouteHandler,
    private readonly modelRouteHandler: AgentModelRouteHandler,
    private readonly jsonResponseWriter: AgentJsonResponseWriter,
    private readonly mcpRouteHandler: AgentMcpRouteHandler,
    private readonly requestUrlFactory: AgentRequestUrlFactory,
    private readonly workspaceRouteHandler: AgentWorkspaceRouteHandler,
    private readonly titleRouteHandler: AgentTitleRouteHandler
  ) {
    this.routeResultWriter = new AgentHttpRouteResultWriter(this.jsonResponseWriter);
    this.authenticatedRouteDispatcher = new AgentHttpAuthenticatedRouteDispatcher(
      this.chatStreamRouteHandler,
      this.jsonResponseWriter,
      this.modelRouteHandler,
      this.mcpRouteHandler,
      this.routeResultWriter,
      this.workspaceRouteHandler,
      this.titleRouteHandler
    );
    this.publicRouteDispatcher = new AgentHttpPublicRouteDispatcher(this.healthRouteHandler, this.routeResultWriter);
  }

  async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = this.requestUrlFactory.create(request);
      if (await this.publicRouteDispatcher.dispatch(request.method, url, response)) {
        return;
      }

      if (!this.authorizer.isAuthorized(request)) {
        this.jsonResponseWriter.write(response, 401, { detail: "invalid agent token" });
        return;
      }

      await this.authenticatedRouteDispatcher.dispatch(url, request, response);
    } catch (error) {
      this.jsonResponseWriter.writeError(response, error);
    }
  }
}
