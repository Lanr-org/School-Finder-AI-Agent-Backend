import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from '../src/integrations/llm/anthropic.client'
import { FallbackLLMClient } from '../src/integrations/llm/fallback.client'
import { OpenAIClient } from '../src/integrations/llm/openai.client'
import type { LLMClient } from '../src/integrations/llm/llm.types'

const { create, openaiCreate } = vi.hoisted(() => ({
  create: vi.fn(),
  openaiCreate: vi.fn(),
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } }
  },
}))
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: openaiCreate } }
  },
}))
vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>()
  return {
    ...actual,
    default: {
      ...actual.default,
      anthropicApiKey: 'test-key',
      anthropicModel: 'claude-opus-5-5',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-test',
    },
  }
})

describe('OpenAIClient', () => {
  beforeEach(() => openaiCreate.mockReset())

  it('sends the system prompt first, then the history, and returns the text', async () => {
    openaiCreate.mockResolvedValue({
      choices: [{ message: { content: ' Book your IELTS next. ' } }],
    })

    const reply = await new OpenAIClient().generateReply(
      [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'what should I do next?' },
      ],
      'You are Smetase.',
    )

    expect(reply).toBe('Book your IELTS next.')
    expect(openaiCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        messages: [
          { role: 'system', content: 'You are Smetase.' },
          { role: 'assistant', content: 'Welcome!' },
          { role: 'user', content: 'what should I do next?' },
        ],
      }),
    )
  })

  it('throws on an empty reply so the next provider can answer', async () => {
    openaiCreate.mockResolvedValue({ choices: [{ message: { content: '' } }] })
    await expect(
      new OpenAIClient().generateReply([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('empty')
  })
})

const fakeClient = (impl: () => Promise<string>): LLMClient => ({
  generateReply: vi.fn(impl),
})

describe('FallbackLLMClient', () => {
  it('uses the primary when it answers', async () => {
    const primary = fakeClient(() => Promise.resolve('from primary'))
    const fallback = fakeClient(() => Promise.resolve('from fallback'))
    const client = new FallbackLLMClient(
      { name: 'anthropic', client: primary },
      { name: 'gemini', client: fallback },
    )

    await expect(client.generateReply([], 'sys')).resolves.toBe('from primary')
    expect(fallback.generateReply).not.toHaveBeenCalled()
  })

  it('falls back when the primary fails (e.g. overloaded)', async () => {
    const primary = fakeClient(() =>
      Promise.reject(new Error('503 overloaded')),
    )
    const fallback = fakeClient(() => Promise.resolve('from fallback'))
    const client = new FallbackLLMClient(
      { name: 'gemini', client: primary },
      { name: 'anthropic', client: fallback },
    )
    const messages = [{ role: 'user' as const, content: 'hi' }]

    await expect(client.generateReply(messages, 'sys')).resolves.toBe(
      'from fallback',
    )
    expect(fallback.generateReply).toHaveBeenCalledWith(messages, 'sys')
  })

  it('surfaces the error when both fail', async () => {
    const client = new FallbackLLMClient(
      {
        name: 'a',
        client: fakeClient(() => Promise.reject(new Error('a down'))),
      },
      {
        name: 'b',
        client: fakeClient(() => Promise.reject(new Error('b down'))),
      },
    )
    await expect(client.generateReply([], undefined)).rejects.toThrow('b down')
  })
})

describe('AnthropicClient', () => {
  beforeEach(() => create.mockReset())

  it('sends the system prompt and history, starting at the first student message', async () => {
    create.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Book your IELTS next.' }],
    })

    const reply = await new AnthropicClient().generateReply(
      [
        { role: 'assistant', content: 'Welcome to Smetase!' },
        { role: 'user', content: 'what should I do next?' },
      ],
      'You are Smetase.',
    )

    expect(reply).toBe('Book your IELTS next.')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5-5',
        system: 'You are Smetase.',
        fallbacks: 'default',
        messages: [{ role: 'user', content: 'what should I do next?' }],
      }),
    )
  })

  it('throws on a refusal so the fallback provider can answer', async () => {
    create.mockResolvedValue({
      stop_reason: 'refusal',
      stop_details: { category: null },
      content: [],
    })
    await expect(
      new AnthropicClient().generateReply([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow('declined')
  })
})
