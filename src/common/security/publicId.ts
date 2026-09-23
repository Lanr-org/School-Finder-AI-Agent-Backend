import { randomBytes } from 'crypto'
import { Prisma } from '../../generated/prisma/index.js'

export const createPublicUserId = (): string => {
  return `USR-${randomBytes(6).toString('hex').toUpperCase()}`
}

export const createPublicSchoolId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `SCH-${randomNum}`
}

export const createPublicProgramId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `PRG-${randomNum}`
}

export const createPublicConversationId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `CON-${randomNum}`
}

export const createPublicNoteId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `NOTE-${randomNum}`
}

export const createPublicFollowUpId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `FUP-${randomNum}`
}

export const createPublicBulletinId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `BUL-${randomNum}`
}

export const createPublicVisaRateId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `VSR-${randomNum}`
}

export const createPublicRecommendationRunId = (): string => {
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `RUN-${randomNum}`
}

const isPublicIdConflict = (error: unknown): boolean => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target).includes('public_id')
  )
}

// Generates a public ID and inserts with it, retrying on the rare case where
// the random ID collides with an existing row (public IDs are only 4 random
// digits, so collisions become likely once a few thousand rows exist).
export const withUniquePublicId = async <T>(
  generateId: () => string,
  insert: (publicId: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await insert(generateId())
    } catch (error) {
      if (!isPublicIdConflict(error) || attempt === maxAttempts) {
        throw error
      }
    }
  }
  throw new Error('Unreachable')
}
