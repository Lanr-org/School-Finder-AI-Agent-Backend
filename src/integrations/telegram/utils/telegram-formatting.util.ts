export class TelegramFormattingUtil {
  /**
   * Escapes plain text content to safely inject into Telegram MarkdownV2 messages.
   */
  static escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
  }

  /**
   * Safely chunks long text content into arrays of <= 3900 character chunks
   * to respect Telegram's 4,096 character limit without breaking words.
   */
  static chunkMessageText(text: string, maxLength = 3900): string[] {
    if (text.length <= maxLength) {
      return [text]
    }

    const chunks: string[] = []
    let currentChunk = ''

    const lines = text.split('\n')

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > maxLength) {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim())
          currentChunk = ''
        }

        // Handle single lines that exceed maxLength by themselves
        if (line.length > maxLength) {
          let remainingLine = line
          while (remainingLine.length > 0) {
            chunks.push(remainingLine.slice(0, maxLength))
            remainingLine = remainingLine.slice(maxLength)
          }
        } else {
          currentChunk = line
        }
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }
}
