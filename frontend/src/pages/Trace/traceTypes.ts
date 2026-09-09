export type TraceNodeStatus = 'STARTED' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'WAITING'

export interface TraceEvent {
  traceId: string
  turnId?: string
  node: string
  status: TraceNodeStatus
  message?: string
  timestamp: number
  durationMs?: number
  source?: string
  metadata?: Record<string, unknown>
}

export interface TraceNodeDefinition {
  id: string
  title: string
  subtitle: string
  group: string
  service: string
  description: string
  topologyGroup: string
}
