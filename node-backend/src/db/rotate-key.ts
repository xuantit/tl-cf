/**
 * Xoay (rotate) ENCRYPTION_KEY: giải mã mọi credential Cloudflare bằng khoá cũ
 * rồi mã hoá lại bằng khoá mới.
 *
 * Chỉ bảng CloudflareAccount.credentialEncrypted được mã hoá, nên đây là toàn bộ
 * dữ liệu cần chuyển đổi.
 *
 * Cách dùng (PowerShell, trong thư mục node-backend):
 *
 *   # 1) Sinh khoá mới
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 *   # 2) Chạy thử (không ghi DB) — ENCRYPTION_KEY trong .env vẫn là khoá CŨ
 *   $env:NEW_ENCRYPTION_KEY="<khoá mới>"; npm run db:rotate-key
 *
 *   # 3) Ghi thật (tự backup ciphertext cũ ra file JSON)
 *   npm run db:rotate-key -- --apply
 *
 *   # 4) Đổi ENCRYPTION_KEY trong .env thành khoá mới rồi restart backend
 *
 * Có thể truyền khoá cũ tường minh bằng OLD_ENCRYPTION_KEY nếu .env đã bị đổi.
 */
import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";

import { db, pool } from "../services/db.js";
import { cloudflareAccounts } from "./schema.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function assertKey(name: string, value: string | undefined): Buffer {
  if (!value) throw new Error(`Thiếu ${name}`);
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} phải là 64 ký tự hex (32 bytes)`);
  }
  return Buffer.from(value, "hex");
}

function decryptWith(key: Buffer, payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Định dạng ciphertext không hợp lệ");
  const [ivHex, authTagHex, encrypted] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

function encryptWith(key: Buffer, text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const oldKey = assertKey(
    "OLD_ENCRYPTION_KEY/ENCRYPTION_KEY",
    process.env.OLD_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY,
  );
  const newKey = assertKey("NEW_ENCRYPTION_KEY", process.env.NEW_ENCRYPTION_KEY);

  if (oldKey.equals(newKey)) {
    console.error("✗ NEW_ENCRYPTION_KEY trùng khoá cũ — không có gì để xoay.");
    process.exitCode = 1;
    return;
  }

  const accounts = await db
    .select({
      id: cloudflareAccounts.id,
      label: cloudflareAccounts.label,
      email: cloudflareAccounts.email,
      credentialEncrypted: cloudflareAccounts.credentialEncrypted,
    })
    .from(cloudflareAccounts);

  console.log(`Tìm thấy ${accounts.length} tài khoản Cloudflare.`);

  const converted: Array<{ id: string; next: string }> = [];
  const failed: Array<{ id: string; label: string | null; reason: string }> = [];

  for (const account of accounts) {
    try {
      const plaintext = decryptWith(oldKey, account.credentialEncrypted);
      const next = encryptWith(newKey, plaintext);
      // Kiểm tra vòng lặp: giải mã lại bằng khoá mới phải ra đúng plaintext
      if (decryptWith(newKey, next) !== plaintext) {
        throw new Error("Kiểm tra sau mã hoá thất bại");
      }
      converted.push({ id: account.id, next });
      console.log(`  ✓ ${account.label || account.email || account.id}`);
    } catch (error) {
      const reason = (error as Error).message;
      failed.push({ id: account.id, label: account.label, reason });
      console.error(`  ✗ ${account.label || account.email || account.id}: ${reason}`);
    }
  }

  if (failed.length > 0) {
    console.error(
      `\n✗ ${failed.length} tài khoản không giải mã được bằng khoá cũ. Dừng lại, không ghi gì vào DB.`,
    );
    console.error("   Kiểm tra lại OLD_ENCRYPTION_KEY có đúng khoá đã dùng để mã hoá không.");
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log(
      `\n✓ Chạy thử OK: ${converted.length} tài khoản sẵn sàng xoay khoá.\n  Chạy lại với --apply để ghi vào DB.`,
    );
    return;
  }

  // Backup ciphertext cũ trước khi ghi đè
  const backupPath = path.resolve(
    process.cwd(),
    `encryption-key-rotation-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      accounts.map((a) => ({ id: a.id, credentialEncrypted: a.credentialEncrypted })),
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`\nĐã backup ciphertext cũ: ${backupPath}`);

  await db.transaction(async (tx) => {
    for (const row of converted) {
      await tx
        .update(cloudflareAccounts)
        .set({ credentialEncrypted: row.next })
        .where(eq(cloudflareAccounts.id, row.id));
    }
  });

  console.log(`✓ Đã xoay khoá cho ${converted.length} tài khoản.`);
  console.log("→ Bước cuối: đổi ENCRYPTION_KEY trong .env thành NEW_ENCRYPTION_KEY rồi restart backend.");
  console.log("→ Sau khi xác nhận chạy ổn, XOÁ file backup vì nó chứa ciphertext cũ.");
}

main()
  .catch((error) => {
    console.error("✗ Rotation thất bại:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
