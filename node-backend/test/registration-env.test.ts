import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Child process only imports validation; no DB or external network. Never inherit
// credentials from the operator's .env (dotenv will not override these values).
function validate(overrides: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
    cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 15000,
    env: {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
      NODE_ENV: 'production', JWT_SECRET: 'safe-test-secret-'.repeat(3), ENCRYPTION_KEY: 'ab'.repeat(32),
      AUTO_SEED_DEFAULT_ADMIN: 'false', DEFAULT_ADMIN_PASSWORD: 'test-password-not-default',
      RESEND_API_KEY: 're_fake_test', RESEND_FROM_EMAIL: 'signup@example.com', APP_URL: 'https://app.example.com',
      INITIAL_SETUP_TOKEN: '', CORS_ORIGINS: 'https://app.example.com', RATE_LIMIT_DISABLED: 'false',
      TURNSTILE_ENABLED: 'true', TURNSTILE_SITE_KEY: '0x4-test-production-site', TURNSTILE_SECRET_KEY: 'test-production-secret', TURNSTILE_ALLOWED_HOSTNAMES: 'app.example.com',
      REGISTRATION_EMAIL_DAILY_LIMIT: '5', REGISTRATION_GLOBAL_DAILY_LIMIT: '100', ...overrides,
    },
    input: `try { await import('./src/utils/env.ts'); console.log('VALID'); } catch { console.log('INVALID'); process.exitCode = 1; }`,
  });
}

describe('registration production configuration', () => {
  it('accepts a valid HTTPS origin with secure defaults', () => expect(validate({}).status).toBe(0));
  it.each(['http://app.example.com', 'http://localhost:5199', 'https://user:pass@app.example.com',
    'https://app.example.com/path', 'https://app.example.com/?next=evil', 'https://app.example.com/#token=x', 'javascript:alert(1)'])
  ('rejects unsafe APP_URL %s', (APP_URL) => expect(validate({ APP_URL }).status).toBe(1));
  it('accepts HTTP localhost in development only', () => expect(validate({ NODE_ENV: 'development', APP_URL: 'http://localhost:5199' }).status).toBe(0));
  it.each([
    { RATE_LIMIT_DISABLED: 'true' }, { REGISTRATION_EMAIL_DAILY_LIMIT: '0' },
    { REGISTRATION_GLOBAL_DAILY_LIMIT: '-1' }, { INITIAL_SETUP_TOKEN: 'short' },
    { CORS_ORIGINS: '*' }, { AUTO_SEED_DEFAULT_ADMIN: 'true', DEFAULT_ADMIN_PASSWORD: 'Admin@123' },
    { TURNSTILE_ENABLED: 'false' }, { TURNSTILE_SECRET_KEY: '' }, { TURNSTILE_SITE_KEY: '' },
    { TURNSTILE_ALLOWED_HOSTNAMES: '' }, { TURNSTILE_ALLOWED_HOSTNAMES: 'localhost' },
    { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, { TURNSTILE_SITE_KEY: '1x00000000000000000000AA' },
  ])('fails closed for insecure settings %j', (override) => expect(validate(override).status).toBe(1));
});