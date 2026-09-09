import type { TraceEvent, TraceNodeDefinition, TraceNodeStatus } from './traceTypes'

export const TRACE_NODES: TraceNodeDefinition[] = [
  { id: 'gateway.auth', title: 'Gateway 鉴权', subtitle: 'JWT / 用户身份', group: '入口治理' },
  { id: 'gateway.risk.input', title: '输入风控', subtitle: '内容安全 / 限流', group: '入口治理' },
  { id: 'chat.accepted', title: 'Chat Service', subtitle: '接收并管理会话', group: '业务服务' },
  { id: 'agent.request', title: 'Agent 编排', subtitle: 'AI 请求代理', group: 'Agent' },
  { id: 'agent.intent.route', title: '意图路由', subtitle: '识别任务类型', group: 'Agent' },
  { id: 'agent.task.plan', title: '任务规划', subtitle: '选择执行步骤', group: 'Agent' },
  { id: 'agent.reasoning', title: '上下文推理', subtitle: '组装上下文', group: 'Agent' },
  { id: 'tool.execute', title: '工具执行', subtitle: 'RAG / Memory / MCP', group: 'Agent' },
  { id: 'llm.stream', title: 'Rust Core + LLM', subtitle: '流式生成', group: '模型执行' },
  { id: 'chat.persist', title: '消息持久化', subtitle: '保存回答和事件', group: '结果处理' },
  { id: 'request.completed', title: '请求完成', subtitle: '链路闭环', group: '结果处理' },
]

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
