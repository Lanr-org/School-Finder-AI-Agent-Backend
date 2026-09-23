import { GoogleGenAI } from '@google/genai'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import type { LLMClient, LLMMessage } from './llm.types.js'

export class GeminiClient implements LLMClient {
  private static clientInstance: GoogleGenAI | null = null

  private static getClient(): GoogleGenAI {
    if (!this.clientInstance) {
      if (!env.geminiApiKey) {
        throw new Error('GEMINI_API_KEY is not configured in environment.')
      }
      this.clientInstance = new GoogleGenAI({ apiKey: env.geminiApiKey })
      logger.info('Gemini client initialized successfully.')
    }
    return this.clientInstance
  }

  async generateReply(messages: LLMMessage[], systemPrompt?: string): Promise<string> {
    const client = GeminiClient.getClient()

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const response = await client.models.generateContent({
      model: env.geminiModel,
      contents,
      ...(systemPrompt ? { config: { systemInstruction: systemPrompt } } : {}),
    })

    if (!response.text) {
      throw new Error('Gemini returned an empty response.')
    }
    return response.text
  }
}
