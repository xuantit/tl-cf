import "dotenv/config";
import dotenv from "dotenv";
import { z } from "zod";

const IS_PRODUCTION = process.env.NODE_ENV === "production";
// Operator-generated Turnstile credentials are isolated from the shared .env.
// Tests must never load real widget secrets. Existing process env takes priority.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: IS_PRODUCTION ? '.env.turnstile.production' : '.env.turnstile.development', quiet: true });
}

// Giá trị mặc định "công khai" — ai đọc repo cũng biết, nên cấm dùng ở production.
const INSECURE_JWT_SECRET = "default-jwt-secret-change-in-production";
const INSECURE_ADMIN_PASSWORD = "Admin@123";

const optionalSetting = (schema: z.ZodString) =>
  z.preprocess((value) => value === "" ? undefined : value, schema.optional());

const envSchema = z.object({
  PORT: z.coerce.number().default(9000),
  HOST: z.string().default(IS_PRODUCTION ? '127.0.0.1' : '::'),
  TURNSTILE_ENABLED: z.enum(['true', 'false']).default(process.env.NODE_ENV === 'test' ? 'false' : 'true').transform((value) => value === 'true'),
  TURNSTILE_SITE_KEY: optionalSetting(z.string().trim().min(1).max(100)),
  TURNSTILE_SECRET_KEY: optionalSetting(z.string().trim().min(1).max(256)),
  TURNSTILE_ALLOWED_HOSTNAMES: z.string().default('').transform((value) => value.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5433/cftool"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET phải dài tối thiểu 32 ký tự").optional(),
  // Missing mail configuration disables new registrations, not existing logins.
  RESEND_API_KEY: optionalSetting(z.string().trim().min(1)),
  RESEND_FROM_EMAIL: optionalSetting(z.string().trim().email()),
  INITIAL_SETUP_TOKEN: optionalSetting(z.string().min(32).max(256)),
  REGISTRATION_EMAIL_DAILY_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  REGISTRATION_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
  APP_URL: optionalSetting(z.string().url()).refine((value) => {
    if (!value) return true;
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && (url.protocol === "https:" ||
        (!IS_PRODUCTION && url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  }, "APP_URL phải là origin HTTPS (HTTP localhost chỉ dùng khi phát triển)"),
  ENCRYPTION_KEY: z
    .string()
    .length(64, "Must be 64 hex characters (32 bytes)")
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY phải là 64 ký tự hex"),
  // Mặc định TẮT ở production: seed admin bằng mật khẩu mặc định là đường chiếm quyền dễ nhất.
  AUTO_SEED_DEFAULT_ADMIN: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? !IS_PRODUCTION : value.toLowerCase() !== "false",
    ),
  DEFAULT_ADMIN_EMAIL: z.string().email().optional().default("admin@example.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).optional().default(INSECURE_ADMIN_PASSWORD),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  // Số proxy tin cậy phía trước (Cloudflare Tunnel / nginx). 0 = không có proxy.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(IS_PRODUCTION ? 1 : 0),
  RATE_LIMIT_DISABLED: z
    .string()
    .optional()
    .transform((value) => value?.toLowerCase() === "true"),
});

const parsed = envSchema.parse(process.env);

if (IS_PRODUCTION) {
  const fatal: string[] = [];
  if (!parsed.TURNSTILE_ENABLED || !parsed.TURNSTILE_SITE_KEY || !parsed.TURNSTILE_SECRET_KEY || !parsed.TURNSTILE_ALLOWED_HOSTNAMES.length) {
    fatal.push('Turnstile must be enabled and fully configured in production');
  }
  if ([parsed.TURNSTILE_SITE_KEY, parsed.TURNSTILE_SECRET_KEY].some((value) => /^[123]x0+/.test(value ?? '')) ||
      parsed.TURNSTILE_ALLOWED_HOSTNAMES.some((hostname) => ['localhost', '127.0.0.1', '::1'].includes(hostname))) {
    fatal.push('Turnstile production must not use test keys or localhost hostnames');
  }
  if (!parsed.JWT_SECRET || parsed.JWT_SECRET === INSECURE_JWT_SECRET) {
    fatal.push("JWT_SECRET phải được đặt (>=32 ký tự ngẫu nhiên) khi NODE_ENV=production");
  }
  if (parsed.AUTO_SEED_DEFAULT_ADMIN && parsed.DEFAULT_ADMIN_PASSWORD === INSECURE_ADMIN_PASSWORD) {
    fatal.push(
      "AUTO_SEED_DEFAULT_ADMIN đang bật với DEFAULT_ADMIN_PASSWORD mặc định — hãy đổi mật khẩu hoặc đặt AUTO_SEED_DEFAULT_ADMIN=false",
    );
  }
  if (parsed.CORS_ORIGINS.some((o) => o === "*")) {
    fatal.push("CORS_ORIGINS không được là '*' khi dùng credentials");
  }
  if (parsed.RATE_LIMIT_DISABLED) {
    fatal.push("RATE_LIMIT_DISABLED không được bật khi NODE_ENV=production");
  }
  if (fatal.length > 0) {
    throw new Error(`Cấu hình bảo mật không hợp lệ:\n- ${fatal.join("\n- ")}`);
  }
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? INSECURE_JWT_SECRET,
};

