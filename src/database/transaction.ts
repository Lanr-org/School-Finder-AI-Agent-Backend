import prisma from './prisma.js'
import type { Prisma, PrismaClient } from '../generated/prisma/index.js'

export type Tx = Prisma.TransactionClient
export type Db = PrismaClient | Tx

// Single seam for opening a transaction — tests mock this module.
export const runInTransaction = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
  prisma.$transaction(fn)

// For repo methods that already open their own transaction: join the caller's
// tx when one is passed (Prisma can't nest interactive transactions), else open one.
export const withTx = <T>(
  tx: Tx | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> => (tx ? fn(tx) : runInTransaction(fn))
