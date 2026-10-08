import OpenAI from 'openai'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import type { LLMClient, LLMMessage } from './llm.types.js'

export class OpenAIClient implements LLMClient {
  private static clientInstance: OpenAI | null = null

  private static getClient(): OpenAI {
    if (!this.clientInstance) {
      if (!env.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not configured in environment.')
      }
      // The SDK retries 429s and 5xx with backoff; kept short so the next provider takes over.
      this.clientInstance = new OpenAI({
        apiKey: env.openaiApiKey,
        maxRetries: 2,
        timeout: 60_000,
      })
      logger.info('OpenAI client initialized successfully.')
    }
    return this.clientInstance
  }

  async generateReply(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): Promise<string> {
    const client = OpenAIClient.getClient()

    const response = await client.chat.completions.create({
      model: env.openaiModel,
      max_completion_tokens: 16000,
      messages: [
        ...(systemPrompt
          ? [{ role: 'system' as const, content: systemPrompt }]
          : []),
        ...messages
          .filter((m) => m.role !== 'system')
          .map((m) =>
            m.role === 'assistant'
              ? { role: 'assistant' as const, content: m.content }
              : { role: 'user' as const, content: m.content },
          ),
      ],
    })

    const text = response.choices[0]?.message.content?.trim()
    if (!text) {
      throw new Error('OpenAI returned an empty response.')
    }
    return text
  }
}
