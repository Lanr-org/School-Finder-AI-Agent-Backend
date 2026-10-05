import { initSentry } from './sentry'

// Imported first in server.ts so Sentry is watching before the rest of the app loads.
initSentry()
