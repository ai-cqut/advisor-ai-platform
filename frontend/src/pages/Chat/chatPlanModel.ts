import type { StreamEventData } from '../../api/chatApi'
import type { ChatEvent, ChatMessage, PlanStep } from './chatTypes'

export function taskPlanFromEvents(events?: ChatEvent[]): StreamEventData | null {
  const plans = (events ?? []).filter((item) => item.event === 'sys_tool_plan')
  if (!plans.length) {
    return null
  }
  const payload = plans[plans.length - 1].payload
  return {
    ...payload,
    stop_when: payload.stop_when ?? payload.stopWhen,
    required_tools: Array.isArray(payload.required_tools)
      ? payload.required_tools
      : Array.isArray(payload.requiredTools) ? payload.requiredTools : undefined,
    route_context: payload.route_context ?? payload.routeContext,
    steps: planStepsFromPayload(payload),
  }
}

export function reasoningEventsFromMessage(events?: ChatEvent[]): ChatEvent[] {
  return (events ?? []).filter((item) => item.event === 'sys_reasoning')
}

export function reasoningStageLabel(stage?: string): string {
  if (stage === 'route') {
    return '路由'
  }
  if (stage === 'delegate') {
    return '委托'
  }
  if (stage === 'plan') {
    return '计划'
  }
  return stage || '思路'
}

export function planStepsFromPayload(payload?: StreamEventData | null): PlanStep[] {
  if (!Array.isArray(payload?.steps)) {
    return []
  }
  return payload.steps.map((rawStep) => {
    const step = rawStep as PlanStep
    return {
      ...step,
      tool_name: step.tool_name ?? step.toolName,
      expected_outcome: step.expected_outcome ?? step.expectedOutcome,
    }
  })
}

export function planStepTitle(step: PlanStep, index: number): string {
  const action = step.action ?? ''
  const toolName = step.tool_name ?? step.toolName ?? ''
  if (action === 'call_tool' && toolName) {
    return `${index + 1}. 调用 ${toolName}`
  }
  if (action === 'final') {
    return `${index + 1}. 生成最终回答`
  }
  return `${index + 1}. 执行计划步骤`
}

export function planStepStatus(
  step: PlanStep,
  msg: ChatMessage,
): 'pending' | 'running' | 'done' | 'error' {
  if (step.action === 'final') {
    if (!msg.streaming && msg.content.trim()) {
      return 'done'
    }
    return msg.content.trim() ? 'running' : 'pending'
  }
  const toolName = step.tool_name ?? step.toolName ?? ''
  if (!toolName) {
    return 'pending'
  }
  const calls = msg.toolCalls ?? []
  const matched = calls.find((item) => item.toolName === toolName)
  if (!matched) {
    return 'pending'
  }
  if (matched.status === 'error') {
    return 'error'
  }
  if (matched.result || matched.status) {
    return 'done'
  }
  return 'running'
}
