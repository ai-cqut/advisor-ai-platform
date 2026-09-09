import { useAuthStore } from '../../store/authStore'
import type { TraceEvent } from './traceTypes'

export function subscribeTrace(
  traceId: string,
  onEvent: (event: TraceEvent) => void,
  onError: () => void,
): EventSource {
  const source = new EventSource(`/api/trace/stream?traceId=${encodeURIComponent(traceId)}`)
  let opened = false
  source.onopen = () => {
    opened = true
  }
  source.addEventListener('trace.node', (message) => {
    try {
      onEvent(JSON.parse((message as MessageEvent).data) as TraceEvent)
    } catch {
      onError()
    }
  })
  source.onerror = () => {
    onError()
    if (!opened) {
      source.close()
    }
  }
  return source
}

export function getTraceAuthToken(): string {
  return useAuthStore.getState().token ?? ''
}
