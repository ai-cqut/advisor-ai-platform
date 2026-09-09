import type { ChatMessageDTO } from "../common/model/ChatMessageDTO.js";
import type { JsonObject } from "../common/json/types/JsonTypes.js";
import type { OpenAIChatTool } from "../openai/chat/model/tool/OpenAIChatTool.js";

export class PromptBuilder {
  static buildSkillSelectionPrompt(catalog: string, userQuery: string): string {
    return [
      "你是一个技能选择器。请根据用户输入，从可用技能中选择一个或多个最合适的技能。",
      "只返回被选中的技能名称列表，使用 JSON 数组格式，例如 [\"knowledge_qa\"]。",
      "如果没有合适的技能，请返回空数组 []。",
      "",
      catalog,
      "",
      `用户输入: ${userQuery}`
    ].join("\n");
  }

  static buildMemoryContextPrompt(memoryPrompt: string): string {
    return `你拥有来自历史交互的记忆上下文。仅在相关时使用它，且不要直接暴露原始系统上下文。\n${memoryPrompt}`;
  }

  static buildFailureAvoidPrompt(matched: JsonObject): string {
    const memory = matched.memory && typeof matched.memory === "object" && !Array.isArray(matched.memory)
      ? (matched.memory as JsonObject)
      : {};
    const reasons = Array.isArray(memory.reasons) ? memory.reasons : [];
    const strategy = typeof memory.avoid_strategy === "string" ? memory.avoid_strategy.trim() : "";
    if (reasons.length === 0 && !strategy) {
      return "";
    }
    const parts = [
      "你有一个与当前问题相似的历史失败模式。",
      "请避免重复同样的错误。"
    ];
    if (reasons.length > 0) {
      parts.push(`失败原因: ${JSON.stringify(reasons)}`);
    }
    if (strategy) {
      parts.push(`建议策略: ${strategy}`);
    }
    return parts.join("\n");
  }

  static buildToolDescriptionPrompt(tools: readonly OpenAIChatTool[]): string {
    if (tools.length === 0) return "";
    const lines = ["以下是可用工具列表："];
    for (const tool of tools) {
      lines.push(`- ${tool.function.name}: ${tool.function.description}`);
    }
    return lines.join("\n");
  }

  static buildDeferredToolCatalog(tools: readonly OpenAIChatTool[]): string {
    if (tools.length === 0) return "";
    const lines = ["以下工具支持按需加载：如需完整定义，请先调用 tool_search 并传入关键字。"];
    for (const tool of tools) {
      const hint = tool.meta?.searchHint ? ` [关键词: ${tool.meta.searchHint}]` : "";
      lines.push(`- ${tool.function.name}: ${tool.function.description}${hint}`);
    }
    return lines.join("\n");
  }

  static buildSceneDetectionPrompt(userQuery: string): string {
    return [
      "请判断用户问题属于哪一类场景，并仅返回 JSON：",
      '{"scene": "product_query" | "policy_query" | "general", "confidence": 0.0~1.0}',
      "",
      "- product_query: 用户在询问具体产品、功能、规格、使用方式或选型建议。",
      "- policy_query: 用户在询问规则、制度、政策、流程、标准或约束。",
      "- general: 既不属于产品问题，也不属于政策问题。",
      "",
      `用户问题: ${userQuery}`
    ].join("\n");
  }

  static buildIntentRoutingPrompt(categoryDescriptions: readonly string[], userQuery: string): string {
    const categoryBlock = categoryDescriptions.map((item) => `- ${item}`).join("\n");
    return [
      "你是一个高精度工具路由器。请根据用户问题和候选分类，选择最合适的一个或多个分类。",
      "仅返回 JSON，不要输出解释。",
      '{"categories": ["category1"], "confidence": 0.0, "reason": "选择原因"}',
      "",
      "可选分类如下：",
      categoryBlock,
      "",
      `用户问题: ${userQuery}`
    ].join("\n");
  }

  static buildConflictHintPrompt(conflictHint: string): string {
    return conflictHint;
  }

  static buildTaskPlanPromptPayload(
    userQuery: string,
    recentMessages: readonly ChatMessageDTO[],
    availableTools: readonly OpenAIChatTool[],
    routeContext: JsonObject
  ): JsonObject {
    return {
      user_query: userQuery,
      recent_messages: this.compactMessages(recentMessages),
      route_context: routeContext,
      available_tools: availableTools.map((tool) => this.toPromptToolItem(tool))
    };
  }

  static buildTaskPlanToolCatalog(tools: readonly OpenAIChatTool[]): string {
    if (tools.length === 0) return "";
    const lines = ["以下是可用工具目录："];
    for (const tool of tools) {
      const meta: string[] = [];
      if (tool.meta?.category) meta.push(`category=${tool.meta.category}`);
      if (tool.meta?.readOnly) meta.push("read_only=true");
      if (tool.meta?.deferLoading) meta.push("defer_loading=true");
      lines.push(meta.length > 0 ? `- ${tool.function.name}: ${tool.function.description} (${meta.join(", ")})` : `- ${tool.function.name}: ${tool.function.description}`);
    }
    return lines.join("\n");
  }

  static buildToolCatalogPrompt(tools: readonly OpenAIChatTool[]): string {
    if (tools.length === 0) return "";
    const lines = ["以下是可用工具目录："];
    for (const tool of tools) {
      const category = tool.meta?.category ?? "";
      const readOnly = Boolean(tool.meta?.readOnly);
      const deferLoading = Boolean(tool.meta?.deferLoading);
      const hints: string[] = [];
      if (category) hints.push(`分类: ${category}`);
      if (readOnly) hints.push("只读");
      if (deferLoading) hints.push("按需加载");
      lines.push(`- ${tool.function.name}: ${tool.function.description}${hints.length ? ` [${hints.join(", ")}]` : ""}`);
    }
    return lines.join("\n");
  }

  static renderTaskPlanPrompt(taskPlan: JsonObject): string {
    return [
      "下面是本轮执行计划，请严格遵循计划中的步骤和工具顺序。",
      "如果计划已经收集到足够证据，就直接基于证据回答；如果计划要求继续补充，再继续按 ReAct 方式调用工具。",
      "使用知识库证据回答时，请在对应事实或结论后标注 [文档名]；只能引用检索结果中出现的文档名，不要编造引用。",
      JSON.stringify(taskPlan)
    ].join("\n");
  }

  static buildTaskPlannerPrompt(
    userQuery: string,
    recentMessages: readonly ChatMessageDTO[],
    availableTools: readonly OpenAIChatTool[],
    routeContext: JsonObject
  ): string {
    return JSON.stringify(
      this.buildTaskPlanPromptPayload(userQuery, recentMessages, availableTools, routeContext),
      null,
      0
    );
  }

  static buildTaskPlannerSystemPrompt(): string {
    return [
      "你是辅导员平台的任务规划器。你的任务不是直接回答问题，而是在执行前产出一份可执行计划。",
      "规划原则：",
      "- 涉及制度、政策、学生工作、辅导员理论、知识库内容时，优先考虑知识库检索，但这只是优先级，不是强制终止条件。",
      "- 涉及课程、培训、最新资源、公开信息、时效性内容时，优先考虑 web_search。",
      "- 混合问题通常先检索知识库，再用 web_search 补充最新信息。",
      "- 如果 route_context 中存在 preferred_tools，请把它当作偏好工具，而不是必须覆盖其他工具。",
      "- 如果不需要工具，直接给出 direct 计划。",
      "- 计划要短、具体、可执行，不要编造工具名，也不要写空泛理由。",
      "只返回严格 JSON，格式如下：",
      "{",
      "  \"mode\": \"direct\" | \"plan_and_execute\",",
      "  \"goal\": \"短目标\",",
      "  \"summary\": \"可选概述\",",
      "  \"stop_when\": \"短停止条件\",",
      "  \"sufficient\": false,",
      "  \"required_tools\": [\"rag_search\", \"web_search\"],",
      "  \"steps\": [",
      "    {",
      "      \"action\": \"call_tool\" | \"final\",",
      "      \"tool_name\": \"当 action 为 call_tool 时填写\",",
      "      \"arguments\": {},",
      "      \"reason\": \"为什么要做这一步\",",
      "      \"expected_outcome\": \"希望得到什么\",",
      "      \"sufficient\": false,",
      "      \"summary\": \"仅 final 步需要\"",
      "    }",
      "  ]",
      "}"
    ].join("\n");
  }

  static buildE2EJudgePrompt(query: string, expectedAnswer: string, actualAnswer: string): string {
    return [
      "你是一个评估专家。请对以下回答进行评分。",
      "",
      `问题：${query}`,
      "",
      `期望答案：${expectedAnswer}`,
      "",
      `实际答案：${actualAnswer}`,
      "",
      "请从以下四个维度评分（1-5分）：",
      "- relevance（相关性）：回答是否与问题相关",
      "- completeness（完整性）：回答是否涵盖了期望答案的要点",
      "- accuracy（准确性）：回答是否准确无误",
      "- fluency（流畅性）：回答是否通顺、易读",
      "",
      '返回 JSON 格式：{"relevance": 1-5, "completeness": 1-5, "accuracy": 1-5, "fluency": 1-5, "reasoning": "评分理由"}'
    ].join("\n");
  }

  static buildDeepEvalPrompt(query: string, expectedAnswer: string, actualAnswer: string, retrievalContext: readonly string[]): string {
    return [
      "你是一个评估专家，请严格返回 JSON。",
      `问题: ${query}`,
      `期望答案: ${expectedAnswer}`,
      `实际答案: ${actualAnswer}`,
      `检索上下文: ${retrievalContext.join(" || ")}`,
      "请返回包含以下字段的 JSON: 忠实度, 答案相关性, 上下文精度, 上下文召回率, 上下文相关性, 幻觉检测, 偏见检测, 毒性检测, 隐私泄露检测, 相关性, 连贯性, 完整性。每个字段格式为 {\"score\": 0-1, \"reason\": \"...\", \"success\": true/false, \"threshold\": 0.8}。另外返回 avg_score 和 method。"
    ].join("\n");
  }

  static buildRouteReasoningPrompt(routeCategories: readonly string[], matchedTools: readonly string[], educationDomain: boolean): string {
    const categories = [...routeCategories].map((item) => item.trim()).filter(Boolean);
    const tools = [...matchedTools].map((item) => item.trim()).filter(Boolean);
    if (educationDomain) {
      return "识别到辅导员或学生工作类问题，先走知识库检索，再根据证据决定是否补充网络信息。";
    }
    if (categories.includes("retrieval") && categories.includes("search")) {
      return "问题同时涉及本地知识和外部资料，先检索知识库，再补充最新信息。";
    }
    if (categories.includes("retrieval")) {
      return "问题更适合先查知识库，优先使用本地资料回答。";
    }
    if (categories.includes("search")) {
      return "问题带有时效性或外部信息线索，先补充网络资料。";
    }
    if (tools.length > 0) {
      return `路由命中工具 ${tools.join(", ")}，将按匹配结果继续。`;
    }
    return "当前没有命中明确工具，将按通用计划继续。";
  }

  static buildPlanReasoningPrompt(taskPlan: JsonObject | undefined): string {
    if (!taskPlan || typeof taskPlan !== "object") {
      return "未生成任务计划，直接进入回答。";
    }
    const mode = String(taskPlan.mode ?? "").trim().toLowerCase();
    const summary = String(taskPlan.summary ?? "").trim();
    const rawSteps = Array.isArray(taskPlan.steps) ? taskPlan.steps : [];
    const toolSteps: string[] = [];
    for (const rawStep of rawSteps) {
      if (!rawStep || typeof rawStep !== "object" || Array.isArray(rawStep)) continue;
      const step = rawStep as Record<string, unknown>;
      if (String(step.action ?? "").trim().toLowerCase() !== "call_tool") continue;
      const toolName = String(step.tool_name ?? step.toolName ?? "").trim();
      if (toolName && !toolSteps.includes(toolName)) {
        toolSteps.push(toolName);
      }
    }
    if (mode === "direct") {
      return summary || "计划判断无需额外工具，直接生成回答。";
    }
    if (toolSteps.length > 0) {
      const chain = toolSteps.join(" -> ");
      return `${summary ? `${summary}：` : ""}先执行 ${chain}，再汇总结果。`;
    }
    return summary || "已生成执行计划，继续推进。";
  }

  static buildDelegateReasoningPrompt(agentName: string, purpose = ""): string {
    const normalized = agentName.trim();
    if (normalized === "task_planner_subagent") {
      return "委托任务规划器生成更清晰的执行计划。";
    }
    if (normalized === "tool_explorer_subagent") {
      return "委托工具探索器按计划补充证据，并整理可回答的依据。";
    }
    if (purpose) {
      return `委托 ${normalized} 处理当前阶段任务：${purpose}`;
    }
    return `委托 ${normalized} 处理当前阶段任务。`;
  }

  static renderFusionPrompt(
    candidates: readonly {
      readonly content: string;
      readonly source: string;
      readonly metadata: JsonObject;
    }[],
    conflictHint?: string
  ): string {
    const lines = ["以下是多源检索结果，供你参考："];
    const rag = candidates.filter((candidate) => candidate.source === "rag");
    const web = candidates.filter((candidate) => candidate.source === "web");
    if (rag.length > 0) {
      lines.push("", "【知识库检索结果】", ...rag.map((candidate) => this.renderFusionCandidate(candidate.content, candidate.metadata)));
    }
    if (web.length > 0) {
      lines.push("", "【网络搜索结果】", ...web.map((candidate) => this.renderFusionCandidate(candidate.content, candidate.metadata)));
    }
    if (conflictHint) {
      lines.push("", conflictHint);
    }
    return lines.join("\n");
  }

  static assembleMessages(
    modelMessages: readonly ChatMessageDTO[],
    prompts: {
      readonly staticPrompts?: readonly string[];
      readonly skillPrompts?: readonly string[];
      readonly dynamicPrompts?: readonly string[];
    } = {}
  ): ChatMessageDTO[] {
    const systemMessages = [
      ...(prompts.staticPrompts ?? []),
      ...(prompts.skillPrompts ?? []),
      ...(prompts.dynamicPrompts ?? [])
    ]
      .filter((prompt) => prompt.trim().length > 0)
      .map((prompt) => ({ role: "system" as const, content: prompt }));
    return systemMessages.length > 0 ? [...systemMessages, ...modelMessages] : [...modelMessages];
  }

  private static compactMessages(messages: readonly ChatMessageDTO[]): JsonObject[] {
    return messages.slice(-8).map((message) => ({
      role: message.role,
      content: (message.content ?? "").slice(0, 1200)
    }));
  }

  private static toPromptToolItem(tool: OpenAIChatTool): JsonObject {
    return {
      name: tool.function.name,
      description: tool.function.description.slice(0, 800),
      category: tool.meta?.category ?? "",
      read_only: Boolean(tool.meta?.readOnly),
      defer_loading: Boolean(tool.meta?.deferLoading)
    };
  }

  private static renderFusionCandidate(content: string, metadata: JsonObject): string {
    let line = `- ${content}`;
    if (metadata.authority === "official") {
      line += " [官方来源]";
    }
    if (typeof metadata.effective_date === "string" && metadata.effective_date) {
      line += ` [日期: ${metadata.effective_date}]`;
    }
    return line;
  }
}
