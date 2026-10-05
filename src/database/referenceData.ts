import type { PrismaClient } from '../generated/prisma/client.js'

// The baseline rows the app needs to work: admin-manageable setting groups with their first
// values, and the first recommendation weights. Shared by the development seed
// (prisma/seed.ts) and the production bootstrap (scripts/bootstrap-admin.ts). Idempotent.

type SettingGroupSeed = {
  key: string
  label: string
  values: string[]
}

// Groups are fixed/seeded, not creatable via the API — only their values are
// admin-manageable. "study-levels" is intentionally distinct from the
// Programs.study_level enum (UNDERGRADUATE/POSTGRADUATE/DOCTORATE/FOUNDATION);
// this list is a separate, free-text-facing categorization.
export const SETTING_GROUPS: SettingGroupSeed[] = [
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

export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const seedSettingGroups = async (
  prisma: PrismaClient,
  log: (message: string) => void = console.log,
): Promise<void> => {
  for (const groupSeed of SETTING_GROUPS) {
    let group = await prisma.settingGroup.findUnique({
      where: { key: groupSeed.key },
    })

    if (!group) {
      group = await prisma.settingGroup.create({
        data: { key: groupSeed.key, label: groupSeed.label },
      })
      log(`Setting group created: ${group.key}`)
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
      log(`Setting values seeded for "${groupSeed.key}": ${count}`)
    }
  }
}

// Default weights preserved from the recommendation-weights UI mockup
// (SettingsPage.tsx, later removed pending this engine) — program-fit
// weighted highest, budget/intake/visa filling the remainder to 100.
export const seedRecommendationWeights = async (
  prisma: PrismaClient,
  log: (message: string) => void = console.log,
): Promise<void> => {
  const existing = await prisma.recommendationWeights.findFirst()
  if (existing) {
    log(`Recommendation weights already seeded (version ${existing.version})`)
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
  log('Recommendation weights seeded: version 1 (35/25/20/20)')
}
