import env, { type LlmProvider } from '../../config/env.js'
import { AnthropicClient } from './anthropic.client.js'
import { FallbackLLMClient } from './fallback.client.js'
import { GeminiClient } from './gemini.client.js'
import { OpenAIClient } from './openai.client.js'
import type { LLMClient } from './llm.types.js'

const clientFor = (provider: LlmProvider): LLMClient => {
  switch (provider) {
    case 'anthropic':
      return new AnthropicClient()
    case 'openai':
      return new OpenAIClient()
    case 'gemini':
      return new GeminiClient()
  }
}

// LLM_PROVIDER answers; each of LLM_FALLBACK_PROVIDERS takes over in order when the one before fails.
const buildClient = (): LLMClient => {
  const order = [env.llmProvider, ...env.llmFallbackProviders].filter(
    (provider, index, all) => all.indexOf(provider) === index,
  )
  return order.slice(1).reduce<{ name: string; client: LLMClient }>(
    (chain, provider) => ({
      name: `${chain.name} → ${provider}`,
      client: new FallbackLLMClient(chain, {
        name: provider,
        client: clientFor(provider),
      }),
    }),
    { name: order[0]!, client: clientFor(order[0]!) },
  ).client
}

export const llmClient: LLMClient = buildClient()
export type { LLMClient, LLMMessage } from './llm.types.js'
