import { vi } from 'vitest'

// Every test file mocks its repositories, but services now open transactions
// (runInTransaction / withTx) and write audit rows. Without these mocks those
// calls would reach the real database. The fake tx is handed straight to the
// (mocked) repo methods, so assertions can match it via expect.anything().
vi.mock('../src/database/transaction', () => {
  const fakeTx = { __fakeTx: true }
  return {
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(fakeTx)),
    withTx: vi.fn(async (tx: unknown, fn: (tx: unknown) => unknown) =>
      fn(tx ?? fakeTx),
    ),
  }
})

vi.mock('../src/modules/audit/audit.repository', () => ({
  AuditRepo: {
    record: vi.fn(async () => undefined),
    list: vi.fn(),
  },
}))
