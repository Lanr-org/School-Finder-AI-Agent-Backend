import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client.js'
import {
  seedRecommendationWeights,
  seedSettingGroups,
} from '../../database/referenceData.js'
import { hashPassword } from '../security/password.js'
import { createPublicUserId } from '../security/publicId.js'

// First-admin creation for production, where prisma/seed.ts never runs. Used by
// scripts/bootstrap-admin.ts; kept here so it can be tested without a database.

// Same character rules as the app's own password change, but longer: this account can do anything.
export const bootstrapInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(160),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

export type BootstrapInput = z.input<typeof bootstrapInputSchema>

// The bootstrap declined to run; the message is safe to show the operator.
export class BootstrapRefusedError extends Error {}

// Creates the first active Admin plus the baseline reference data (setting groups and
// recommendation weights). Refuses if any admin already exists (even a disabled one), or if the
// email belongs to someone else, so it can never promote, reset or duplicate an account.
export const bootstrapAdmin = async (
  prisma: PrismaClient,
  rawInput: BootstrapInput,
  log: (message: string) => void = console.log,
) => {
  const input = bootstrapInputSchema.parse(rawInput)

  const existingAdmin = await prisma.users.findFirst({
    where: { role: 'ADMIN' },
    select: { email: true },
  })
  if (existingAdmin) {
    throw new BootstrapRefusedError(
      `An admin already exists (${existingAdmin.email}). Refusing to create another one.`,
    )
  }

  const emailOwner = await prisma.users.findUnique({
    where: { email: input.email },
    select: { id: true },
  })
  if (emailOwner) {
    throw new BootstrapRefusedError(
      'That email already belongs to a user who is not an admin. Refusing to change it.',
    )
  }

  await seedSettingGroups(prisma, log)
  await seedRecommendationWeights(prisma, log)

  const admin = await prisma.users.create({
    data: {
      public_id: createPublicUserId(),
      full_name: input.fullName,
      email: input.email,
      password_hash: await hashPassword(input.password),
      role: 'ADMIN',
      status: 'ACTIVE',
      password_changed_at: new Date(),
    },
    select: { email: true, public_id: true },
  })
  log(`Admin created: ${admin.email} (${admin.public_id})`)
  return admin
}
