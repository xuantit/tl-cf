import "dotenv/config";
import { z } from "zod";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Giá trị mặc định "công khai" — ai đọc repo cũng biết, nên cấm dùng ở production.
const INSECURE_JWT_SECRET = "default-jwt-secret-change-in-production";
const INSECURE_ADMIN_PASSWORD = "Admin@123";

const envSchema = z.object({
  PORT: z.coerce.number().default(9000),
  DATABASE_URL: z
    .string()
    .default("postgresql://postgres:postgres@localhost:5433/cftool"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET phải dài tối thiểu 32 ký tự").optional(),
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
  if (fatal.length > 0) {
    throw new Error(`Cấu hình bảo mật không hợp lệ:\n- ${fatal.join("\n- ")}`);
  }
}

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? INSECURE_JWT_SECRET,
};

