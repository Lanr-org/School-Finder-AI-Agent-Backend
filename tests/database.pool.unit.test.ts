import pg from 'pg'
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  RetryingPool,
  isConnectError,
  withConnectRetry,
} from '../src/database/pool'

const codeError = (code: string, message = `connect ${code}`) =>
  Object.assign(new Error(message), { code })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isConnectError', () => {
  it('recognises errors from opening a connection', () => {
    expect(isConnectError(codeError('ETIMEDOUT'))).toBe(true)
    expect(isConnectError(codeError('ECONNREFUSED'))).toBe(true)
    expect(
      isConnectError(codeError('57P03', 'the database system is starting up')),
    ).toBe(true)
    expect(
      isConnectError(new Error('Connection terminated unexpectedly')),
    ).toBe(true)
  })

  it('ignores query errors and non-errors', () => {
    expect(isConnectError(codeError('23505', 'duplicate key value'))).toBe(
      false,
    )
    expect(isConnectError(new Error('syntax error at or near "SELEC"'))).toBe(
      false,
    )
    expect(isConnectError('ETIMEDOUT')).toBe(false)
  })
})

describe('withConnectRetry', () => {
  it('retries connection errors until it succeeds', async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(codeError('ETIMEDOUT'))
      .mockRejectedValueOnce(codeError('ECONNRESET'))
      .mockResolvedValue('connected')

    await expect(withConnectRetry(open, [0, 0, 0])).resolves.toBe('connected')
    expect(open).toHaveBeenCalledTimes(3)
  })

  it('does not retry other errors', async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error('password authentication failed'))

    await expect(withConnectRetry(open, [0, 0, 0])).rejects.toThrow(
      'password authentication failed',
    )
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('gives up after the last delay', async () => {
    const open = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(codeError('ETIMEDOUT'))

    await expect(withConnectRetry(open, [0, 0])).rejects.toThrow(
      'connect ETIMEDOUT',
    )
    expect(open).toHaveBeenCalledTimes(3)
  })
})

describe('RetryingPool.connect', () => {
  const fakeClient = { release: vi.fn() } as unknown as pg.PoolClient
  // The base connect() as the retrying pool calls it: the promise form only.
  const spyOnBaseConnect = () =>
    vi.spyOn(pg.Pool.prototype, 'connect') as unknown as MockInstance<
      () => Promise<pg.PoolClient>
    >

  it('retries the promise form', async () => {
    const connect = spyOnBaseConnect()
      .mockImplementationOnce(() => Promise.reject(codeError('ETIMEDOUT')))
      .mockImplementation(() => Promise.resolve(fakeClient))
    const pool = new RetryingPool({}, [0])

    await expect(pool.connect()).resolves.toBe(fakeClient)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('retries the callback form that pool.query uses', async () => {
    spyOnBaseConnect()
      .mockImplementationOnce(() => Promise.reject(codeError('ETIMEDOUT')))
      .mockImplementation(() => Promise.resolve(fakeClient))
    const pool = new RetryingPool({}, [0])

    const client = await new Promise((resolve, reject) => {
      pool.connect((err, c) => (err ? reject(err) : resolve(c)))
    })
    expect(client).toBe(fakeClient)
  })

  it('passes a final failure to the callback', async () => {
    spyOnBaseConnect().mockImplementation(() =>
      Promise.reject(codeError('ETIMEDOUT')),
    )
    const pool = new RetryingPool({}, [0])

    const err = await new Promise((resolve) => {
      pool.connect((e) => resolve(e))
    })
    expect(err).toMatchObject({ code: 'ETIMEDOUT' })
  })
})
