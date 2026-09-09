import type { ChatStreamMessageDTO } from '../../api/chatApi'
import type { ChatMessage, ChatSession } from './chatTypes'

export function createUserMessage(
  id: number,
  content: string,
  attachments: ChatMessage['attachments'],
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    attachments,
    streaming: false,
  }
}

export function createAssistantPlaceholder(id: number): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    streaming: true,
    progressText: '模型思考中，请稍候... (0s)',
  }
}

export function buildHistoryMessages(
  sessionMessages: ChatMessage[],
  userMessage: ChatMessage,
): ChatStreamMessageDTO[] {
  return [...sessionMessages, userMessage]
    .map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
      attachments: msg.attachments?.map((file) => file.id),
    }))
    .filter((msg) => msg.content.length > 0 || (msg.attachments && msg.attachments.length > 0))
}

export function appendOptimisticMessages(
  sessions: ChatSession[],
  targetSession: ChatSession,
  userMessage: ChatMessage,
  assistantPlaceholder: ChatMessage,
): ChatSession[] {
  let matched = false
  const titleText = userMessage.content.slice(0, 3)
  const mapped = sessions.map((session) => {
    if (session.id !== targetSession.id) {
      return session
    }
    matched = true
    const nextTitle = session.messages.length === 0 ? titleText : session.title
    return {
      ...session,
      title: nextTitle,
      messages: [...session.messages, userMessage, assistantPlaceholder],
    }
  })

  if (matched) {
    return mapped
  }

  return [{
    id: targetSession.id,
    title: titleText,
    updatedAt: targetSession.updatedAt,
    messages: [userMessage, assistantPlaceholder],
  }, ...mapped]
}
