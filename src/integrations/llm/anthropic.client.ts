import Anthropic from '@anthropic-ai/sdk'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import type { LLMClient, LLMMessage } from './llm.types.js'

export class AnthropicClient implements LLMClient {
  private static clientInstance: Anthropic | null = null

  private static getClient(): Anthropic {
    if (!this.clientInstance) {
      if (!env.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured in environment.')
      }
      // The SDK retries 429s, 5xx and overloaded (529) responses with backoff.
      // Kept short: a student is waiting, and the fallback provider takes over after.
      this.clientInstance = new Anthropic({
        apiKey: env.anthropicApiKey,
        maxRetries: 2,
        timeout: 60_000,
      })
      logger.info('Anthropic client initialized successfully.')
    }
    return this.clientInstance
  }

  async generateReply(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): Promise<string> {
    const client = AnthropicClient.getClient()

    const history: Anthropic.Beta.BetaMessageParam[] = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }))
    // The conversation must open with the student: drop a leading greeting from the bot.
    const firstUser = history.findIndex((m) => m.role === 'user')
    if (firstUser === -1) {
      throw new Error('No student message to reply to.')
    }

    const response = await client.beta.messages.create({
      model: env.anthropicModel,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // If a safety check declines, the API retries on a suitable fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: history.slice(firstUser),
    })

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `Claude declined to reply (${response.stop_details?.category ?? 'no category'}).`,
      )
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
    if (!text) {
      throw new Error('Claude returned an empty response.')
    }
    return text
  }
}
