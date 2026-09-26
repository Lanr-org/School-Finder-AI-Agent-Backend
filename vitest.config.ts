import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Global mocks so HTTP/service tests never open real DB transactions or
    // write real audit rows. Individual test files can override them.
    setupFiles: ['tests/setup-global-mocks.ts'],
  },
})
