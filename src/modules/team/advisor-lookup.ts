import TeamRepo from './team.repository.js'

export type AdvisorRef = { publicId: string; fullName: string }

// Student.assigned_advisor_id / Conversations' derived advisor id are internal Users UUIDs
// (no Prisma relation exists to auto-join Users). Batch-resolve them to the public-facing
// {publicId, fullName} shape the frontend actually needs, instead of leaking internal ids.
export const buildAdvisorLookup = async (advisorIds: (string | null)[]): Promise<Map<string, AdvisorRef>> => {
  const ids = [...new Set(advisorIds.filter((id): id is string => id !== null))]
  if (ids.length === 0) return new Map()

  const advisors = await TeamRepo.findUsersByIds(ids)
  return new Map(advisors.map((advisor) => [advisor.id, { publicId: advisor.public_id, fullName: advisor.full_name }]))
}
