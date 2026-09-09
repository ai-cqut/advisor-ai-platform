import type { AgentRuntime } from "../../../app/runtime/core/AgentRuntime.js";
import type { AgentConfig } from "../../../config/model/core/AgentConfig.js";
import type { McpToolService } from "../../../mcp/tools/core/service/McpToolService.js";
import type { WorkspaceManager } from "../../../workspace/core/manager/WorkspaceManager.js";
import { AgentWorkspaceRouteHandler } from "../../../workspace/routes/core/handler/AgentWorkspaceRouteHandler.js";
import { AgentHttpRequestReader } from "../../request/reader/AgentHttpRequestReader.js";
import { AgentRequestUrlFactory } from "../../request/url/AgentRequestUrlFactory.js";
import { AgentJsonResponseWriter } from "../../response/core/json/AgentJsonResponseWriter.js";
import { AgentChatStreamRouteHandler } from "../../routes/chat/AgentChatStreamRouteHandler.js";
import { AgentHealthRouteHandler } from "../../routes/health/AgentHealthRouteHandler.js";
import { AgentMcpRouteHandler } from "../../routes/mcp/core/AgentMcpRouteHandler.js";
import { AgentModelRouteHandler } from "../../routes/models/AgentModelRouteHandler.js";
import { AgentTitleRouteHandler } from "../../routes/chat/AgentTitleRouteHandler.js";
import { AgentHttpRouter } from "../core/AgentHttpRouter.js";
import { AgentRequestAuthorizer } from "../security/AgentRequestAuthorizer.js";

export class AgentHttpRouterFactory {
  create(
    config: AgentConfig,
    runtime: AgentRuntime,
    workspaceManager: WorkspaceManager,
    mcpToolService?: McpToolService
  ): AgentHttpRouter {
    const requestReader = new AgentHttpRequestReader();
    return new AgentHttpRouter(
      new AgentRequestAuthorizer(config),
      new AgentChatStreamRouteHandler(runtime),
      new AgentHealthRouteHandler(runtime),
      new AgentModelRouteHandler(runtime),
      new AgentJsonResponseWriter(),
      new AgentMcpRouteHandler(mcpToolService, requestReader),
      new AgentRequestUrlFactory(),
      new AgentWorkspaceRouteHandler(workspaceManager, requestReader),
      new AgentTitleRouteHandler(runtime, requestReader)
    );
  }
}
