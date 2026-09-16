import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { pendingRegistrations, registrationMailQuotas, users } from "../db/schema.js";
import { db } from "./db.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { env } from "../utils/env.js";
import { RegistrationError, requireRegistrationEmailConfig, sendRegistrationEmail } from "./registrationEmail.js";

export const REGISTRATION_RESEND_SECONDS = 60;
const TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
class MailboxQuotaExceeded extends Error {}

// Quota grouping only; never rewrite account identities for arbitrary mail providers.
export function registrationMailboxKey(email: string) {
  let [local, domain] = email.trim().toLowerCase().split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    local = local.split("+")[0].replace(/\./g, "");
  }
  return `mailbox:${hashToken(`${local}@${domain}`)}`;
}

type RegistrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function claimMailQuota(tx: RegistrationTransaction, key: string, limit: number, now: Date) {
  const expiresAt = new Date(now.getTime() + DAY_MS);
  const rows = await tx.insert(registrationMailQuotas).values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: registrationMailQuotas.key,
      set: {
        count: sql`CASE WHEN ${registrationMailQuotas.expiresAt} <= ${now} THEN 1 ELSE ${registrationMailQuotas.count} + 1 END`,
        expiresAt: sql`CASE WHEN ${registrationMailQuotas.expiresAt} <= ${now} THEN ${expiresAt} ELSE ${registrationMailQuotas.expiresAt} END`,
      },
      setWhere: sql`${registrationMailQuotas.expiresAt} <= ${now} OR ${registrationMailQuotas.count} < ${limit}`,
    }).returning({ key: registrationMailQuotas.key });
  return rows.length > 0;
}

export async function requestRegistration(email: string) {
  requireRegistrationEmailConfig();
  const now = new Date();
  await db.delete(pendingRegistrations).where(and(
    lt(pendingRegistrations.expiresAt, now),
    lt(pendingRegistrations.requestedAt, new Date(now.getTime() - REGISTRATION_RESEND_SECONDS * 1000)),
  ));
  await db.delete(registrationMailQuotas).where(lt(registrationMailQuotas.expiresAt, now));
  const existing = await db.query.users.findFirst({
    where: sql`lower(${users.email}) = ${email}`,
    columns: { id: true },
  });
  // Same response for registered addresses: don't disclose account existence.
  if (existing) return;

  const delivery = await db.transaction(async (tx) => {
    const token = randomBytes(32).toString("hex");
    const values = {
      email, tokenHash: hashToken(token), tokenEncrypted: encrypt(token),
      expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS), requestedAt: now,
    };
    const inserted = await tx.insert(pendingRegistrations).values(values).onConflictDoNothing()
      .returning({ email: pendingRegistrations.email });
    const [pending] = await tx.select().from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, email)).for("update");
    if (!pending) return null; // Verification won the race with this resend.
    if (!inserted.length && pending.requestedAt.getTime() > now.getTime() - REGISTRATION_RESEND_SECONDS * 1000) return null;
    // Legacy tokens cannot be reconstructed: preserve the link until it expires.
    if (!pending.tokenEncrypted && pending.expiresAt > now) return null;
    if (!await claimMailQuota(tx, registrationMailboxKey(email), env.REGISTRATION_EMAIL_DAILY_LIMIT, now)) {
      // Roll back a newly inserted alias row too; exhausted mailboxes must not
      // become a way to grow PendingRegistration without consuming global quota.
      throw new MailboxQuotaExceeded();
    }
    if (!await claimMailQuota(tx, "global", env.REGISTRATION_GLOBAL_DAILY_LIMIT, now)) {
      throw new RegistrationError(503, "EMAIL_QUOTA_EXCEEDED", "Đã đạt hạn mức gửi email. Vui lòng thử lại sau.");
    }
    const reuse = pending.expiresAt > now && pending.tokenEncrypted;
    const activeToken = reuse ? decrypt(pending.tokenEncrypted!) : token;
    const expiresAt = reuse ? pending.expiresAt : values.expiresAt;
    await tx.update(pendingRegistrations).set(reuse ? { requestedAt: now } : values)
      .where(eq(pendingRegistrations.email, email));
    return { token: activeToken, expiresAt, deliveryId: randomBytes(16).toString("hex") };
  }).catch((error: unknown) => {
    if (error instanceof MailboxQuotaExceeded) return null;
    throw error;
  });
  if (!delivery) return;
  // Failed sends still count toward both quotas and cooldown. Never invalidate
  // an earlier delivered link or allow distributed retries to hammer the provider.
  await sendRegistrationEmail(email, delivery.token, delivery.deliveryId, delivery.expiresAt);
}

function invalidToken() {
  return new RegistrationError(400, "INVALID_VERIFICATION_TOKEN",
    "Liên kết xác minh không hợp lệ, đã hết hạn hoặc đã được sử dụng. Vui lòng đăng ký lại để nhận liên kết mới.");
}

export async function completeRegistration(token: string, password: string) {
  const tokenHash = hashToken(token);
  const pending = await db.query.pendingRegistrations.findFirst({
    where: and(eq(pendingRegistrations.tokenHash, tokenHash), gt(pendingRegistrations.expiresAt, new Date())),
  });
  if (!pending) throw invalidToken();
  // Password is chosen by the email owner, not by whoever requested the email.
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.transaction(async (tx) => {
    const [claimed] = await tx.delete(pendingRegistrations).where(and(
      eq(pendingRegistrations.tokenHash, tokenHash),
      gt(pendingRegistrations.expiresAt, new Date()),
    )).returning();
    if (!claimed) return null;
    const existing = await tx.query.users.findFirst({
      where: sql`lower(${users.email}) = ${claimed.email}`, columns: { id: true },
    });
    if (existing) return null;
    const [created] = await tx.insert(users).values({
      email: claimed.email, passwordHash, role: "user",
    }).onConflictDoNothing().returning({ id: users.id, email: users.email, role: users.role });
    return created ?? null;
  });
  if (!user) throw invalidToken();
  return user;
}