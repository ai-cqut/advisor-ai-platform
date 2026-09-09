import type { StreamEventData, StreamToolResult } from '../../api/chatApi'
import type { WorkspaceFileDTO } from '../../api/workspaceApi'

export interface Source {
  id: number
  docName: string
  snippet: string
  score?: number
}

export interface ToolCall {
  id: string
  toolName: string
  input?: unknown
  status?: string
  message?: string
  result?: StreamToolResult
}

export interface ChatEvent {
  id: string
  event: string
  payload: StreamEventData
  source?: string
  traceId?: string
  timestamp?: number
}

export interface PlanStep {
  action?: string
  tool_name?: string
  toolName?: string
  arguments?: unknown
  reason?: string
  expected_outcome?: string
  expectedOutcome?: string
  sufficient?: boolean
  summary?: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  attachments?: WorkspaceFileDTO[]
  sources?: Source[]
  toolCalls?: ToolCall[]
  events?: ChatEvent[]
  streaming?: boolean
  progressText?: string
}

export interface ChatSession {
  id: number
  title: string
  updatedAt: string
  messages: ChatMessage[]
}
