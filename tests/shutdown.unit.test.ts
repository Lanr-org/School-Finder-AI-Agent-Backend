import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShutdown } from '../src/shutdown'

// ── Fakes ────────────────────────────────────────────────────────────────────
// Every close step records itself in `calls`, so ordering is asserted directly.

let calls: string[]

const makeServer = (opts: { drains?: boolean } = {}) => {
  const drains = opts.drains ?? true
  return {
    close: vi.fn((callback: () => void) => {
      calls.push('server.close')
      // A draining server calls back once in-flight requests finish; a stuck one never does.
      if (drains) setTimeout(callback, 0)
    }),
    closeIdleConnections: vi.fn(() =>
      calls.push('server.closeIdleConnections'),
    ),
    closeAllConnections: vi.fn(() => calls.push('server.closeAllConnections')),
  }
}

const step = (name: string, impl?: () => Promise<unknown>) => ({
  name,
  close: vi.fn(async () => {
    calls.push(name)
    if (impl) return impl()
  }),
})

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const setup = (overrides: Record<string, unknown> = {}) => {
  const exit = vi.fn((code: number) => calls.push(`exit(${code})`))
  const logger = makeLogger()
  const deps = {
    server: makeServer(),
    workers: [step('inbound-worker'), step('outbound-worker')],
    queues: [step('inbound-queue'), step('outbound-queue')],
    prisma: {
      $disconnect: vi.fn(async () => {
        calls.push('prisma')
      }),
    },
    logger,
    exit,
    httpDrainMs: 1000,
    hardDeadlineMs: 5000,
    ...overrides,
  }
  return { shutdown: createShutdown(deps as any), exit, logger, deps }
}

describe('createShutdown', () => {
  beforeEach(() => {
    calls = []
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drains HTTP, then closes workers, queues, and Prisma in order, and exits 0', async () => {
    const { shutdown, exit } = setup()

    const done = shutdown('SIGTERM')
    await vi.runAllTimersAsync()
    await done

    expect(calls).toEqual([
      'server.close',
      'server.closeIdleConnections',
      'inbound-worker',
      'outbound-worker',
      'inbound-queue',
      'outbound-queue',
      'prisma',
      'exit(0)',
    ])
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('ignores a second signal while shutdown is already running', async () => {
    const { shutdown, exit, deps } = setup()

    const first = shutdown('SIGINT')
    const second = shutdown('SIGINT')
    await vi.runAllTimersAsync()
    await Promise.all([first, second])

    expect(deps.server.close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('force-closes connections when in-flight requests outlast the drain window, then continues and exits 1', async () => {
    const { shutdown, exit, logger } = setup({
      server: makeServer({ drains: false }),
    })

    const done = shutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(1000)
    await done

    expect(calls).toContain('server.closeAllConnections')
    // Remaining steps still ran after the forced drain.
    expect(calls.slice(-2)).toEqual(['prisma', 'exit(1)'])
    expect(logger.warn).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('keeps closing the remaining resources when one step fails, and exits 1', async () => {
    const { shutdown, exit, logger } = setup({
      workers: [
        step('inbound-worker', async () => {
          throw new Error('redis connection reset')
        }),
        step('outbound-worker'),
      ],
    })

    const done = shutdown('SIGTERM')
    await vi.runAllTimersAsync()
    await done

    expect(calls).toEqual(
      expect.arrayContaining([
        'outbound-worker',
        'inbound-queue',
        'outbound-queue',
        'prisma',
      ]),
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'inbound-worker' }),
      'Shutdown step failed',
    )
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('forces exit(1) at the hard deadline when a step hangs', async () => {
    const { shutdown, exit } = setup({
      workers: [step('inbound-worker', () => new Promise(() => {}))],
    })

    void shutdown('SIGTERM')
    await vi.advanceTimersByTimeAsync(5000)

    expect(exit).toHaveBeenCalledWith(1)
    // Resources after the hung step were never reached — the deadline is what exits.
    expect(calls).not.toContain('prisma')
  })
})
