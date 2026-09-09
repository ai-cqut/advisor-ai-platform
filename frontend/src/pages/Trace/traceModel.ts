import type { TraceEvent, TraceNodeDefinition, TraceNodeStatus } from './traceTypes'

export const TRACE_NODES: TraceNodeDefinition[] = [
  {
    id: 'gateway.auth',
    title: 'Gateway 鉴权',
    subtitle: 'JWT / 用户身份',
    group: '入口治理',
    service: 'Gateway',
    description: '校验访问令牌并提取用户身份，决定请求是否可以进入业务链路。',
    topologyGroup: 'gateway',
  },
  {
    id: 'gateway.risk.input',
    title: '输入风控',
    subtitle: '内容安全 / 限流',
    group: '入口治理',
    service: 'Risk Control',
    description: '对用户输入进行安全策略检查，支持放行、拦截和 fail-open 策略。',
    topologyGroup: 'gateway',
  },
  {
    id: 'chat.accepted',
    title: 'Chat Service',
    subtitle: '接收并管理会话',
    group: '业务服务',
    service: 'Chat Service',
    description: '创建本轮对话上下文，生成 turnId，并负责最终消息持久化。',
    topologyGroup: 'chat',
  },
  {
    id: 'agent.request',
    title: 'Chat 调用 Agent',
    subtitle: '请求转发 / 流式代理',
    group: 'Agent',
    service: 'Chat Service',
    description: 'Chat Service 将本轮会话、用户身份、traceId 转发给 Agent Runtime，并把 Agent 流式结果回写给前端。',
    topologyGroup: 'chat',
  },
  {
    id: 'agent.intent.route',
    title: '意图路由',
    subtitle: '识别任务类型',
    group: 'Agent',
    service: 'Agent Runtime',
    description: '根据用户问题识别任务类别，并决定后续需要使用的能力或工具。',
    topologyGroup: 'agent',
  },
  {
    id: 'agent.task.plan',
    title: '任务规划',
    subtitle: '选择执行步骤',
    group: 'Agent',
    service: 'Agent Runtime',
    description: '把用户目标拆分为可执行步骤，确定工具调用顺序和停止条件。',
    topologyGroup: 'agent',
  },
  {
    id: 'agent.reasoning',
    title: '上下文推理',
    subtitle: '组装上下文',
    group: 'Agent',
    service: 'Agent Runtime',
    description: '结合路由结果、历史上下文和工具结果，形成下一阶段的推理上下文。',
    topologyGroup: 'agent',
  },
  {
    id: 'tool.execute',
    title: '工具执行',
    subtitle: 'RAG / Memory / MCP',
    group: 'Agent',
    service: 'Tool Gateway',
    description: '执行 Agent 选择的外部工具，例如知识库检索、记忆查询或 MCP 能力。',
    topologyGroup: 'tools',
  },
  {
    id: 'llm.stream',
    title: 'Rust Core + LLM',
    subtitle: '流式生成',
    group: '模型执行',
    service: 'AI Gateway',
    description: '调用模型生成回答，并将 token 或 delta 事件持续返回给 Chat Service。',
    topologyGroup: 'model',
  },
  {
    id: 'chat.persist',
    title: '消息持久化',
    subtitle: '保存回答和事件',
    group: '结果处理',
    service: 'Chat Service',
    description: '保存用户消息、助手回答、来源和 Agent 事件，保证会话结果可追溯。',
    topologyGroup: 'chat',
  },
  {
    id: 'request.completed',
    title: '请求完成',
    subtitle: '链路闭环',
    group: '结果处理',
    service: 'Gateway',
    description: '发送链路完成事件，前端据此结束本次 Trace 监听。',
    topologyGroup: 'gateway',
  },
]

export const TRACE_TOPOLOGY_NODES = [
  {
    id: 'gateway',
    title: 'Gateway',
    subtitle: '鉴权 · 风控 · Trace Hub',
    description: '统一入口，负责访问控制、输入风控和链路事件分发。',
  },
  {
    id: 'chat',
    title: 'Chat Service',
    subtitle: '会话编排 · 持久化',
    description: '承接聊天请求，连接 Agent，并管理最终会话结果。',
  },
  {
    id: 'agent',
    title: 'Agent Runtime',
    subtitle: '路由 · 规划 · 推理',
    description: '理解用户目标，规划工具调用并汇总执行结果。',
  },
  {
    id: 'tools',
    title: 'Tool Gateway',
    subtitle: 'RAG · Memory · MCP',
    description: '为 Agent 提供可调用的知识库、记忆和外部工具能力。',
  },
  {
    id: 'model',
    title: 'AI Gateway',
    subtitle: 'Rust Core · LLM',
    description: '承接模型调用和流式输出，向上游返回生成事件。',
  },
]

export const TRACE_TOPOLOGY_EDGES = [
  ['gateway', 'chat'],
  ['chat', 'agent'],
  ['agent', 'tools'],
  ['tools', 'agent'],
  ['agent', 'model'],
  ['model', 'chat'],
] as const

export function createInitialTraceEvents(): TraceEvent[] {
  return []
}

export function latestEventForNode(events: TraceEvent[], nodeId: string): TraceEvent | undefined {
  return [...events].reverse().find((event) => event.node === nodeId)
}

export function nodeStatus(events: TraceEvent[], nodeId: string): TraceNodeStatus {
  return latestEventForNode(events, nodeId)?.status ?? 'WAITING'
}

export function statusLabel(status: TraceNodeStatus): string {
  return {
    STARTED: '执行中',
    SUCCESS: '成功',
    FAILED: '失败',
    SKIPPED: '跳过',
    WAITING: '等待',
  }[status]
}

export function formatDuration(durationMs?: number): string {
  return typeof durationMs === 'number' ? `${durationMs} ms` : '进行中'
}

export function definitionForNode(nodeId: string): TraceNodeDefinition | undefined {
  return TRACE_NODES.find((definition) => definition.id === nodeId)
}

export function eventSummary(event?: TraceEvent): string {
  if (!event) return '尚未收到该节点事件'
  return event.message || '事件已收到，暂无文字说明'
}
