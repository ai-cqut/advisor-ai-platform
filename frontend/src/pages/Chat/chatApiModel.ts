import type { ChatSessionDTO, StreamSourceItem } from '../../api/chatApi'
import type { ChatSession, Source } from './chatTypes'

export function toDisplaySources(items: StreamSourceItem[], message?: string): Source[] {
  if (items.length > 0) {
    return items.map((item, index) => ({
      id: item.id || index + 1,
      docName: item.docName || '未命名文档',
      snippet: item.snippet || '',
      score: item.score,
    }))
  }
  return [
    {
      id: -1,
      docName: '检索提示',
      snippet: message || '未返回可展示来源',
    },
  ]
}

export function toChatSession(data: ChatSessionDTO): ChatSession {
  return {
    id: data.id,
    title: normalizeSessionTitle(data.title),
    updatedAt: data.updatedAt,
    messages: [],
  }
}

export function normalizeSessionTitle(title: string | null | undefined): string {
  const normalized = title?.trim() ?? ''
  return !normalized || normalized === '???' ? '新对话' : normalized
}

export function isSessionNotFoundError(error: unknown): boolean {
  if (typeof error === 'string') {
    return error.includes('会话不存在')
  }
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const maybe = error as {
    response?: { status?: number; data?: { message?: string } }
    config?: { url?: string }
  }
  const message = maybe.response?.data?.message
  if (typeof message === 'string' && message.includes('会话不存在')) {
    return true
  }
  const status = maybe.response?.status
  const url = maybe.config?.url ?? ''
  if (status === 404 && typeof url === 'string' && /\/chat\/sessions\/\d+\/messages/.test(url)) {
    return true
  }
  return false
}
