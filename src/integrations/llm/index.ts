import { GeminiClient } from './gemini.client.js'
import type { LLMClient } from './llm.types.js'

export const llmClient: LLMClient = new GeminiClient()
export type { LLMClient, LLMMessage } from './llm.types.js'
