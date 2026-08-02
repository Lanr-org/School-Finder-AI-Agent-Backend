import axios from 'axios'
import env from '../../../config/env.js'
import { logger } from '../../../config/logger.js'
import { CentrifugoChannel, CentrifugoEventPayload } from '../types/centrifugo.types.js'

export class CentrifugoClient {
  /**
   * Publishes an event payload to a target Centrifugo channel via HTTP POST.
   */
  static async publish<T>(
    channel: CentrifugoChannel,
    eventPayload: CentrifugoEventPayload<T>
  ): Promise<boolean> {
    if (!env.centrifugoApiKey) {
      logger.warn({ channel }, 'Centrifugo API Key missing; skipping real-time publish.')
      return false
    }

    try {
      const response = await axios.post(
        `${env.centrifugoApiUrl}/publish`,
        {
          channel,
          data: eventPayload,
        },
        {
          headers: {
            'X-API-Key': env.centrifugoApiKey,
            'Content-Type': 'application/json',
          },
          timeout: 3000, // 3-second safeguard timeout
        }
      )

      if (response.status === 200) {
        logger.debug({ channel, event: eventPayload.event }, 'Event published to Centrifugo.')
        return true
      }

      return false
    } catch (error) {
      // Non-blocking catch: Real-time broadcast failures must never crash database transactions
      logger.error(
        { channel, event: eventPayload.event, error: (error as Error).message },
        'Failed to publish event to Centrifugo.'
      )
      return false
    }
  }
}
