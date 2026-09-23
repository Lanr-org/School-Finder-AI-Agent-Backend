import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { PrismaClient } from '../src/generated/prisma/client.js'

const seedEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test']).default('development'),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required.'),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  SEED_ADMIN_PASSWORD: z
    .string()
    .min(12, 'SEED_ADMIN_PASSWORD must contain at least 12 characters.')
    .max(128, 'SEED_ADMIN_PASSWORD must contain at most 128 characters.'),
  SEED_ADMIN_FULL_NAME: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .default('System Administrator'),
})

const seedEnvironment = seedEnvironmentSchema.safeParse(process.env)

if (!seedEnvironment.success) {
  console.error('Invalid seed environment:')
  console.error(z.prettifyError(seedEnvironment.error))
  process.exit(1)
}

const config = seedEnvironment.data
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function createPublicUserId(): string {
  return `USR-${randomBytes(6).toString('hex').toUpperCase()}`
}

const seedBootstrapAdmin = async (): Promise<void> => {
  const userWithSeedEmail = await prisma.users.findUnique({
    where: { email: config.SEED_ADMIN_EMAIL },
    select: { email: true, role: true, status: true },
  })

  if (userWithSeedEmail) {
    if (
      userWithSeedEmail.role === 'ADMIN' &&
      userWithSeedEmail.status === 'ACTIVE'
    ) {
      console.log(`Bootstrap admin already exists: ${userWithSeedEmail.email}`)
      return
    }

    throw new Error(
      'SEED_ADMIN_EMAIL already belongs to a user that is not an active admin.',
    )
  }

  const existingAdmin = await prisma.users.findFirst({
    where: { role: 'ADMIN' },
    select: { email: true },
  })

  if (existingAdmin) {
    throw new Error(
      `An admin already exists (${existingAdmin.email}). Refusing to create another bootstrap admin.`,
    )
  }

  const passwordHash = await argon2.hash(config.SEED_ADMIN_PASSWORD, {
    type: argon2.argon2id,
  })

  const admin = await prisma.users.create({
    data: {
      public_id: createPublicUserId(),
      full_name: config.SEED_ADMIN_FULL_NAME,
      email: config.SEED_ADMIN_EMAIL,
      password_hash: passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      password_changed_at: new Date(),
    },
    select: {
      email: true,
      public_id: true,
    },
  })

  console.log(`Bootstrap admin created: ${admin.email} (${admin.public_id})`)
}

type SettingGroupSeed = {
  key: string
  label: string
  values: string[]
}

// Groups are fixed/seeded, not creatable via the API — only their values are
// admin-manageable. "study-levels" is intentionally distinct from the
// Programs.study_level enum (UNDERGRADUATE/POSTGRADUATE/DOCTORATE/FOUNDATION);
// this list is a separate, free-text-facing categorization.
const SETTING_GROUPS: SettingGroupSeed[] = [
  {
    key: 'countries',
    label: 'Destination Countries',
    values: [
      'United Kingdom',
      'Canada',
      'United States',
      'Australia',
      'Ireland',
      'Germany',
    ],
  },
  {
    key: 'categories',
    label: 'Program Categories',
    values: [
      'Business',
      'Computer Science',
      'Engineering',
      'Data and Business Intelligence',
    ],
  },
  {
    key: 'study-levels',
    label: 'Study Levels',
    values: [
      'Certificate',
      'Diploma',
      'Undergraduate',
      'Postgraduate',
      'Masters',
      'Doctorate',
    ],
  },
]

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const seedSettingGroups = async (): Promise<void> => {
  for (const groupSeed of SETTING_GROUPS) {
    let group = await prisma.settingGroup.findUnique({
      where: { key: groupSeed.key },
    })

    if (!group) {
      group = await prisma.settingGroup.create({
        data: { key: groupSeed.key, label: groupSeed.label },
      })
      console.log(`Setting group created: ${group.key}`)
    }

    const { count } = await prisma.settingValue.createMany({
      data: groupSeed.values.map((label) => ({
        group_id: group.id,
        key: slugify(label),
        label,
      })),
      skipDuplicates: true,
    })

    if (count > 0) {
      console.log(`Setting values seeded for "${groupSeed.key}": ${count}`)
    }
  }
}

// Default weights preserved from the recommendation-weights UI mockup
// (SettingsPage.tsx, later removed pending this engine) — program-fit
// weighted highest, budget/intake/visa filling the remainder to 100.
const seedRecommendationWeights = async (): Promise<void> => {
  const existing = await prisma.recommendationWeights.findFirst()
  if (existing) {
    console.log(
      `Recommendation weights already seeded (version ${existing.version})`,
    )
    return
  }

  await prisma.recommendationWeights.create({
    data: {
      version: 1,
      program_weight: 35,
      budget_weight: 25,
      intake_weight: 20,
      visa_weight: 20,
    },
  })
  console.log('Recommendation weights seeded: version 1 (35/25/20/20)')
}

const main = async (): Promise<void> => {
  await seedBootstrapAdmin()
  await seedSettingGroups()
  await seedRecommendationWeights()
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Error seeding database: ${message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
