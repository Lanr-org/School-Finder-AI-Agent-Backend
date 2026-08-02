import jwt from 'jsonwebtoken'
import env from '../../../config/env.js'

export class CentrifugoTokenService {
  /**
   * Generates a signed JWT for frontend WebSocket connection authentication.
   * Defaults to 24 hours (86400 seconds).
   */
  static generateConnectionToken(userId: string, expiresInSeconds = 86400): string {
    if (!env.centrifugoHMACSecret) {
      throw new Error('CENTRIFUGO_HMAC_SECRET is not configured in env')
    }

    return jwt.sign(
      {
        sub: userId,
      },
      env.centrifugoHMACSecret,
      {
        expiresIn: expiresInSeconds,
      }
    )
  }

  /**
   * Generates a signed JWT subscription token for private channel access (e.g. advisors#<id>).
   */
  static generateSubscriptionToken(
    userId: string,
    channel: string,
    expiresInSeconds = 86400
  ): string {
    if (!env.centrifugoHMACSecret) {
      throw new Error('CENTRIFUGO_HMAC_SECRET is not configured in env')
    }

    return jwt.sign(
      {
        sub: userId,
        channel,
      },
      env.centrifugoHMACSecret,
      {
        expiresIn: expiresInSeconds,
      }
    )
  }
}
