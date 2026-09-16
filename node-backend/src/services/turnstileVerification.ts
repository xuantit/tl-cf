import { env } from '../utils/env.js';
import { RegistrationError } from './registrationEmail.js';

export function publicTurnstileConfig() {
  if (!env.TURNSTILE_ENABLED) return { enabled: false, siteKey: null };
  if (!env.TURNSTILE_SITE_KEY || !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_ALLOWED_HOSTNAMES.length) {
    throw new RegistrationError(503, 'TURNSTILE_NOT_CONFIGURED', 'Xác minh chống bot chưa sẵn sàng. Vui lòng thử lại sau.');
  }
  return { enabled: true, siteKey: env.TURNSTILE_SITE_KEY };
}

function rejected() {
  return new RegistrationError(400, 'TURNSTILE_REJECTED', 'Xác minh chống bot không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.');
}

export async function verifyTurnstile(token: unknown, action: 'register' | 'verify_email') {
  publicTurnstileConfig();
  if (!env.TURNSTILE_ENABLED) return; // Tests/local opt-out only; production validation forbids it.
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) throw rejected();
  let response: Response;
  let data: { success?: unknown; hostname?: unknown; action?: unknown; challenge_ts?: unknown; 'error-codes'?: unknown };
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    data = await response.json() as typeof data;
  } catch {
    throw new RegistrationError(503, 'TURNSTILE_UNAVAILABLE', 'Dịch vụ xác minh chống bot đang gián đoạn. Vui lòng thử lại.');
  }
  if (!response.ok || !data || typeof data !== 'object') {
    throw new RegistrationError(503, 'TURNSTILE_UNAVAILABLE', 'Dịch vụ xác minh chống bot đang gián đoạn. Vui lòng thử lại.');
  }
  if (data.success !== true) throw rejected();
  // Official dummy keys intentionally return synthetic hostname/action/timestamp.
  // Only permit their documented response in non-production with a dummy secret.
  const dummy = process.env.NODE_ENV !== 'production' && env.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA';
  if (dummy && token === 'XXXX.DUMMY.TOKEN.XXXX') return;
  const age = typeof data.challenge_ts === 'string' ? Date.now() - Date.parse(data.challenge_ts) : NaN;
  if (typeof data.hostname !== 'string' || !env.TURNSTILE_ALLOWED_HOSTNAMES.includes(data.hostname.toLowerCase()) ||
      data.action !== action || !Number.isFinite(age) || age > 300000 || age < -30000) throw rejected();
  // Never cache successful verification. Siteverify redeems each token once,
  // preventing replays across processes; each new submission requires a fresh token.
}