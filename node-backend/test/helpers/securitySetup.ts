import { vi } from 'vitest';

// Replace configuration BEFORE app modules load: no real DB, provider credentials,
// auto-seeding or secrets from the developer's .env may enter these tests.
vi.hoisted(() => {
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    JWT_SECRET: 'isolated-security-tests-secret-at-least-32-chars',
    ENCRYPTION_KEY: 'ab'.repeat(32), AUTO_SEED_DEFAULT_ADMIN: 'false',
    RESEND_API_KEY: 're_isolated_test_only', RESEND_FROM_EMAIL: 'signup@example.com',
    APP_URL: 'https://app.example.com', TRUST_PROXY_HOPS: '0',
    CORS_ORIGINS: 'https://app.example.com', RATE_LIMIT_DISABLED: 'false',
    INITIAL_SETUP_TOKEN: '', REGISTRATION_EMAIL_DAILY_LIMIT: '5', REGISTRATION_GLOBAL_DAILY_LIMIT: '100',
    TURNSTILE_ENABLED: 'false', TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET_KEY: '', TURNSTILE_ALLOWED_HOSTNAMES: '',
  });
  // Normal test requests skip IP limits; each abuse test explicitly enables them.
  delete process.env.RATE_LIMIT_DISABLED;
});
vi.mock('../../src/services/db.js', () => import('./isolatedDb.js'));
vi.mock('../../src/utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Fail closed if a test accidentally forgets to mock the provider itself.
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('External fetch disabled in security tests'))));