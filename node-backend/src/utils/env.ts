import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(9000),
  JWT_SECRET: z.string().min(16).optional().default("default-jwt-secret-change-in-production"),
  ENCRYPTION_KEY: z.string().length(64, "Must be 64 hex characters (32 bytes)"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
});

export const env = envSchema.parse(process.env);

