// Creates the first Admin in production, where prisma/seed.ts never runs.
//
//   BOOTSTRAP_ADMIN_PASSWORD='...' node dist/scripts/bootstrap-admin.js \
//     --email you@example.com --name "Your Name"
//
// (or `npm run bootstrap:admin -- --email ... --name ...`). Run it once, as a one-off job
// against the production database (DATABASE_URL). The password comes from the environment, never
// an argument, so it stays out of shell history and process lists. It also seeds the baseline
// reference data, and refuses to run if any admin already exists.
import { parseArgs } from 'node:util'
import { PrismaPg } from '@prisma/adapter-pg'
import { ZodError } from 'zod'
import {
  BootstrapRefusedError,
  bootstrapAdmin,
} from '../src/common/bootstrap/bootstrapAdmin.js'
import { PrismaClient } from '../src/generated/prisma/client.js'

const USAGE =
  'Usage: BOOTSTRAP_ADMIN_PASSWORD=... bootstrap-admin --email <email> --name "<full name>"'

const main = async (): Promise<number> => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
    },
    strict: true,
  })
  const databaseUrl = process.env.DATABASE_URL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

  if (!values.email || !values.name || !password || !databaseUrl) {
    console.error(USAGE)
    console.error('DATABASE_URL and BOOTSTRAP_ADMIN_PASSWORD must be set in the environment.')
    return 1
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  })
  try {
    await bootstrapAdmin(prisma, {
      email: values.email,
      fullName: values.name,
      password,
    })
    return 0
  } catch (error) {
    if (error instanceof BootstrapRefusedError) {
      console.error(error.message)
    } else if (error instanceof ZodError) {
      // Field messages only; never echo the values (the password is one of them).
      for (const issue of error.issues) {
        console.error(`Invalid ${issue.path.join('.') || 'input'}: ${issue.message}`)
      }
    } else {
      console.error('Bootstrap failed:', error instanceof Error ? error.message : 'unknown error')
    }
    return 1
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error('Bootstrap failed:', error instanceof Error ? error.message : 'unknown error')
    process.exitCode = 1
  })
