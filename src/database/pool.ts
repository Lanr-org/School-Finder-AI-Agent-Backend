import pg from 'pg'

// Neon's free compute sleeps after 5 minutes without queries and takes a few seconds to wake.
// The first connection attempt after a sleep can fail (ETIMEDOUT in production on 2026-10-14),
// which surfaced as a 500 on whatever the user was doing. This pool retries opening a
// connection, and only that: a failed connect means nothing reached the database, so trying
// again can't run anything twice. Errors from queries themselves are never retried.
//
// pg's own pool.query() gets its connection through connect(), so overriding connect() covers
// every query the Prisma adapter runs, as well as transactions.

const CONNECT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P03', // the database system is starting up
])

export const isConnectError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && CONNECT_ERROR_CODES.has(code)) return true
  return /Connection terminated|timeout exceeded when trying to connect/i.test(
    error.message,
  )
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1500, 3000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const withConnectRetry = async <T>(
  open: () => Promise<T>,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await open()
    } catch (error) {
      const delay = delaysMs[attempt]
      if (delay === undefined || !isConnectError(error)) throw error
      await sleep(delay)
    }
  }
}

type ConnectCallback = (
  err: Error | undefined,
  client: pg.PoolClient | undefined,
  done: (release?: unknown) => void,
) => void

export class RetryingPool extends pg.Pool {
  constructor(
    config: pg.PoolConfig,
    private readonly retryDelaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  ) {
    super(config)
  }

  override connect(): Promise<pg.PoolClient>
  override connect(callback: ConnectCallback): void
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | void {
    const opened = withConnectRetry(() => super.connect(), this.retryDelaysMs)
    if (!callback) return opened
    opened.then(
      (client) =>
        callback(undefined, client, (release) =>
          client.release(release as Error | boolean),
        ),
      (error: Error) => callback(error, undefined, () => {}),
    )
  }
}
