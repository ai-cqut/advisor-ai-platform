export interface ChatStreamMessageDTO {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: number[]
}

export interface StreamPayload {
  messages: ChatStreamMessageDTO[]
  sessionId: number
  attachments?: number[]
}

export interface StreamSourceItem {
  id: number
  docName: string
  snippet: string
  score?: number
}

export interface StreamToolResult {
  status?: string
  message?: string
  items?: unknown[]
  output?: unknown
  derived?: {
    sources?: StreamSourceItem[]
  }
}

export interface StreamRiskAlert {
  code: number
  message: string
  category: string
}

export interface StreamEventData extends Record<string, unknown> {
  text?: string
  message?: string
  goal?: string
  summary?: string
  stop_when?: string
  stopWhen?: string
  status?: string
  items?: StreamSourceItem[]
  elapsed_sec?: number
  finish_reason?: string
  tool_name?: string
  tool_call_id?: string
  input?: unknown
  output?: unknown
  code?: string
  stage?: string
  agent_name?: string
  matched_by?: string
  categories?: string[]
  reason?: string
  source?: string
  required_tools?: string[]
  requiredTools?: string[]
  mode?: string
  sufficient?: boolean
  steps?: Array<{
    action?: string
    tool_name?: string
    toolName?: string
    arguments?: unknown
    reason?: string
    expected_outcome?: string
    expectedOutcome?: string
    sufficient?: boolean
    summary?: string
  }>
  derived?: {
    sources?: StreamSourceItem[]
  }
  route_context?: Record<string, unknown>
  routeContext?: Record<string, unknown>
}

export interface StreamEventRecord {
  event: string
  source?: string
  traceId?: string
  timestamp?: number
  payload?: StreamEventData
}

export interface StreamHandlers {
  onStart?: () => void
  onEvent?: (data: { event: string; payload: StreamEventData }) => void
  onProgress?: (message: string, elapsedSec?: number) => void
  onReasoningDelta?: (text: string) => void
  onDelta?: (text: string) => void
  onSystemEvent?: (data: { event: string; payload: StreamEventData }) => void
  onSources?: (items: StreamSourceItem[], status?: string, message?: string) => void
  onToolUse?: (data: { toolName: string; toolCallId: string; input: unknown }) => void
  onToolResult?: (data: { toolName: string; toolCallId: string; result: StreamToolResult }) => void
  onToolError?: (data: { toolName: string; toolCallId: string; message: string; code?: string }) => void
  onEnd?: () => void
  onError?: (message: string) => void
  onRiskAlert?: (data: StreamRiskAlert) => void
  onUnknownEvent?: (event: string, data: unknown) => void
}
