export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMClient {
  generateReply(messages: LLMMessage[], systemPrompt?: string): Promise<string>
}
