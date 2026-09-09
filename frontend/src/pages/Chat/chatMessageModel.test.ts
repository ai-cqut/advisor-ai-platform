import { describe, expect, it } from 'vitest'
import {
  describeSystemState,
  eventDisplayDetail,
  normalizeEventRecords,
  planStepStatus,
  planStepsFromPayload,
  renderToolResultSummary,
  taskPlanFromEvents,
  toolCallsFromEvents,
} from './chatMessageModel'

describe('chatMessageModel', () => {
  it('normalizes persisted events and derives tool calls', () => {
    const events = normalizeEventRecords([
      {
        event: 'tool_use',
        timestamp: 1,
        payload: { tool_name: 'web_search', tool_call_id: 'call-1', input: { q: '招生' } },
      },
      {
        event: 'tool_result',
        timestamp: 2,
        payload: {
          tool_name: 'web_search',
          tool_call_id: 'call-1',
          status: 'ok',
          output: { summary: '找到相关材料' },
        },
      },
      { event: 'debug_only', payload: { message: 'ignore me' } },
    ])

    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('tool_use:call-1')
    expect(toolCallsFromEvents(events)).toEqual([
      {
        id: 'call-1',
        toolName: 'web_search',
        input: { q: '招生' },
        status: 'ok',
        message: undefined,
        result: {
          status: 'ok',
          message: undefined,
          items: undefined,
          output: { summary: '找到相关材料' },
          derived: undefined,
        },
      },
    ])
  })

  it('renders event details and system progress text', () => {
    expect(renderToolResultSummary('web_search', { output: { summary: '摘要' } })).toBe('摘要')
    expect(eventDisplayDetail('tool_error', { message: '超时' })).toBe('超时')
    expect(describeSystemState('sys_intent_route', { categories: ['rag'], matched_by: 'rule' }))
      .toBe('正在路由工具：rag（matched_by：rule）')
  })

  it('normalizes camel-case plan events and marks executed steps done', () => {
    const events = normalizeEventRecords([
      {
        event: 'sys_tool_plan',
        payload: {
          mode: 'plan_and_execute',
          requiredTools: ['rag_search'],
          routeContext: { categories: ['retrieval'] },
          steps: [{
            action: 'call_tool',
            toolName: 'rag_search',
            expectedOutcome: '得到知识库片段',
          }],
        },
      },
      {
        event: 'tool_result',
        payload: {
          tool_name: 'rag_search',
          tool_call_id: 'plan-1-rag_search',
          status: 'hit',
          items: [],
        },
      },
    ])
    const plan = taskPlanFromEvents(events)
    const steps = planStepsFromPayload(plan)

    expect(plan?.required_tools).toEqual(['rag_search'])
    expect(plan?.route_context).toEqual({ categories: ['retrieval'] })
    expect(steps[0].tool_name).toBe('rag_search')
    expect(planStepStatus(steps[0], {
      id: 1,
      role: 'assistant',
      content: '已回答',
      events,
      toolCalls: toolCallsFromEvents(events),
      streaming: false,
    })).toBe('done')
  })
})
