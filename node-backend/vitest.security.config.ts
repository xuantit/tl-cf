import { defineConfig } from 'vitest/config'

// Adversarial tests must never connect to the shared development/production DB.
export default defineConfig({
  test: {
    environment: 'node',
    include: process.env.SECURITY_FULL_SUITE === 'true'
      ? ['test/**/*.test.ts']
      : ['test/registration*.test.ts', 'test/security.test.ts', 'test/auth-profile.test.ts', 'test/sessions.test.ts'],
    setupFiles: ['test/helpers/securitySetup.ts'],
    maxWorkers: 2,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})