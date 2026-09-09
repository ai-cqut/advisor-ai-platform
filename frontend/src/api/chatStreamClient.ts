import { resolveAgentStreamEndpoint } from './agentEndpoint'
import { useAuthStore } from '../store/authStore'
import { readChatStreamBody } from './chatStreamReader'
import { createStreamTimeouts, normalizeStreamError } from './chatStreamTimeouts'
import type { StreamHandlers, StreamPayload } from './chatStreamTypes'

const FIRST_PACKET_TIMEOUT_MS = 30_000
const IDLE_TIMEOUT_MS = 60_000

function getAuthToken(): string {
  const token = useAuthStore.getState().token
  if (!token) {
    throw new Error('auth token missing')
  }
  return token
}

export async function streamChat(payload: StreamPayload, handlers: StreamHandlers): Promise<void> {
  const controller = new AbortController()
  const streamTimeouts = createStreamTimeouts(
    controller,
    FIRST_PACKET_TIMEOUT_MS,
    IDLE_TIMEOUT_MS,
  )

  streamTimeouts.startFirstPacketTimer()

  try {
    const endpoint = resolveAgentStreamEndpoint(getAuthToken())
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        ...endpoint.headers,
        ...(payload.traceId ? { 'X-Trace-Id': payload.traceId } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`stream failed: http ${response.status}`)
    }

    await readChatStreamBody(response.body, handlers, {
      onFirstEvent: streamTimeouts.markFirstPacketReceived,
      onStreamActivity: streamTimeouts.resetIdleTimer,
    })
  } catch (error) {
    throw normalizeStreamError(error, streamTimeouts.getTimeoutType())
  } finally {
    streamTimeouts.clear()
  }
}
