import { describe, expect, it, vi } from 'vitest'
import StudentLinkRepo from '../src/modules/studentLink/studentLink.repository'
import type { MergeSide } from '../src/modules/studentLink/studentLink.rules'
import type { Tx } from '../src/database/transaction'

// absorb runs inside the merge transaction; a fake tx records what it writes.
const fakeTx = (survivorCheckKeys: string[]) => {
  const model = () => ({
    count: vi.fn(() => Promise.resolve(0)),
    findMany: vi.fn(() => Promise.resolve([] as unknown[])),
    updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    update: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  })
  const tx = {
    conversations: model(),
    studentShortlist: model(),
    studentJourneyCheck: model(),
    studyPlanLink: model(),
    studentIdentity: model(),
    studentSession: model(),
    student: model(),
    contacts: model(),
  }
  tx.studentJourneyCheck.findMany.mockResolvedValue(
    survivorCheckKeys.map((key) => ({ key })),
  )
  return tx
}

const side = (id: string): MergeSide =>
  ({
    id,
    contact_id: `contact-${id}`,
    contact: { email: null },
    study_level: null,
    target_destinations: [],
    target_intake_month: null,
    target_intake_year: null,
    budget_range: null,
    academic_background: null,
    english_test_score: null,
    chosen_program_id: null,
    study_plan_shared_at: null,
  }) as unknown as MergeSide

describe('StudentLinkRepo.absorb', () => {
  it("moves journey ticks, keeping the survivor's own tick on a clash", async () => {
    const tx = fakeTx(['DEPOSIT_PAID'])
    await StudentLinkRepo.absorb(
      side('survivor'),
      side('absorbed'),
      tx as unknown as Tx,
    )

    expect(tx.studentJourneyCheck.deleteMany).toHaveBeenCalledWith({
      where: { student_id: 'absorbed', key: { in: ['DEPOSIT_PAID'] } },
    })
    expect(tx.studentJourneyCheck.updateMany).toHaveBeenCalledWith({
      where: { student_id: 'absorbed' },
      data: { student_id: 'survivor' },
    })
    // The clash is removed before the move, or the composite key would collide.
    expect(
      tx.studentJourneyCheck.deleteMany.mock.invocationCallOrder[0]!,
    ).toBeLessThan(
      tx.studentJourneyCheck.updateMany.mock.invocationCallOrder[0]!,
    )
  })

  it('moves study plan links so links already sent keep working', async () => {
    const tx = fakeTx([])
    await StudentLinkRepo.absorb(
      side('survivor'),
      side('absorbed'),
      tx as unknown as Tx,
    )

    expect(tx.studyPlanLink.updateMany).toHaveBeenCalledWith({
      where: { student_id: 'absorbed' },
      data: { student_id: 'survivor' },
    })
    // Both moves happen before the absorbed contact (and, by cascade, student) is deleted.
    expect(
      tx.studyPlanLink.updateMany.mock.invocationCallOrder[0]!,
    ).toBeLessThan(tx.contacts.delete.mock.invocationCallOrder[0]!)
  })
})
