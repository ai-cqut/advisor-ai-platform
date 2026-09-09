import type {
  StreamEventRecord,
  StreamSourceItem,
} from '../../api/chatApi'
import type { ChatMessage } from './chatTypes'
import { normalizeEventRecords } from './chatEventRecordModel'
import { toolCallsFromEvents } from './chatToolCallModel'
export type { ChatEvent, ChatMessage, ChatSession, PlanStep, Source, ToolCall } from './chatTypes'
export {
  isSessionNotFoundError,
  normalizeSessionTitle,
  toChatSession,
  toDisplaySources,
} from './chatApiModel'
export {
  describeSystemState,
  eventDisplayDetail,
  eventDisplayTitle,
  eventTagColor,
} from './chatEventDisplayModel'
export { normalizeEventRecords, streamEventRecord } from './chatEventRecordModel'
export {
  planStepStatus,
  planStepTitle,
  planStepsFromPayload,
  reasoningEventsFromMessage,
  reasoningStageLabel,
  taskPlanFromEvents,
} from './chatPlanModel'
export { renderToolPayload, renderToolResultSummary } from './chatToolRenderModel'
export { toolCallsFromEvents } from './chatToolCallModel'

export function toChatMessage(data: {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: StreamSourceItem[]
  events?: StreamEventRecord[]
}): ChatMessage {
  const events = normalizeEventRecords(data.events)
  return {
    id: data.id,
    role: data.role,
    content: data.content,
    sources: data.sources?.map((item, index) => ({
      id: item.id || index + 1,
      docName: item.docName || '未命名文档',
      snippet: item.snippet || '',
      score: item.score,
    })),
    events,
    toolCalls: toolCallsFromEvents(events),
    streaming: false,
  }
}
