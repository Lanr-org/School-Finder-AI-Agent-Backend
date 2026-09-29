import { logger } from '../../config/logger.js'
import type { LLMClient, LLMMessage } from './llm.types.js'

// Tries the primary provider, and the fallback when it fails (overloaded, rate limited,
// down, or declined). Each provider has already done its own short retries by then.
export class FallbackLLMClient implements LLMClient {
  constructor(
    private readonly primary: { name: string; client: LLMClient },
    private readonly fallback: { name: string; client: LLMClient },
  ) {}

  async generateReply(
    messages: LLMMessage[],
    systemPrompt?: string,
  ): Promise<string> {
    try {
      return await this.primary.client.generateReply(messages, systemPrompt)
    } catch (error) {
      logger.warn(
        {
          err: error,
          primary: this.primary.name,
          fallback: this.fallback.name,
        },
        'Primary LLM failed; trying the fallback provider.',
      )
      return this.fallback.client.generateReply(messages, systemPrompt)
    }
  }
}
