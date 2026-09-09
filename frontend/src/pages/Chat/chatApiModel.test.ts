import { describe, expect, it } from 'vitest'
import { normalizeSessionTitle, toChatSession } from './chatApiModel'

describe('chatApiModel', () => {
  it('normalizes legacy placeholder titles', () => {
    expect(normalizeSessionTitle('???')).toBe('新对话')
    expect(normalizeSessionTitle('')).toBe('新对话')
  })

  it('maps a generated title without changing it', () => {
    expect(toChatSession({ id: 1, title: '学生压力疏导', updatedAt: '' }).title)
      .toBe('学生压力疏导')
  })
})
