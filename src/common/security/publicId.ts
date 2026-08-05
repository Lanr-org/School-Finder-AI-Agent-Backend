import { randomBytes } from 'crypto'

export const createPublicUserId = (): string => {
  return `USR-${randomBytes(6).toString('hex').toUpperCase()}`
}
